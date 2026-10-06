-- T-28 수기 주문 사후 입력(F-34, DECISIONS #62). Architecture 2-1 번호표 0104.
-- Requires 0001(스키마)·0008(T-53)·0010(create_order — 같은 멱등키 잠금)·0016(get_stats).
-- 1) orders에 출처·종이 주문 시각·수기 번호를 추가한다. 기존 주문은 모두 'customer'.
-- 2) create_manual_order: 완료 상태 주문 + 상태 이력 + 재고 차감을 한 트랜잭션으로 저장한다.
--    재고가 모자라도 저장하고 재고는 0에서 멈춘다(CHECK (stock >= 0) 유지).
-- 3) get_stats: 날짜를 종이 주문 시각 기준으로 나눈다(수기 주문만. 그 밖은 created_at 그대로).
-- 실패는 RAISE EXCEPTION '<코드>' USING DETAIL = JSON 문자열(create_order와 같은 방식).
--   EMPTY_ITEMS                 p_items가 비었거나 배열이 아님
--   INVALID_ITEMS               항목 모양 오류(menuItemId·quantity 1..99·optionIds). API zod가 먼저 막으므로 방어용
--   INVALID_MANUAL_ORDERED_AT   종이 주문 시각이 없거나 미래(5분 여유)
--   MENU_UNAVAILABLE            없는 메뉴·한국어 이름 없는 메뉴        DETAIL {"menuItemId"}
--   INVALID_OPTION              다른 메뉴의 옵션·중복·max 초과·활성 그룹 min 미달 DETAIL {"menuItemId"}
--   INVALID_MANUAL_NUMBER       수기 번호가 없거나 1..9999 밖
--   MANUAL_NUMBER_TAKEN         같은 수기 번호의 주문이 이미 있음(다른 멱등키) DETAIL {"manualNumber"}
--   IDEMPOTENCY_KEY_CONFLICT    같은 멱등키가 고객 주문에 이미 쓰임
BEGIN;

ALTER TABLE public.orders
    ADD COLUMN source text NOT NULL DEFAULT 'customer',
    ADD COLUMN manual_ordered_at timestamptz,
    ADD COLUMN manual_number integer,
    ADD CONSTRAINT orders_source_valid CHECK (source IN ('customer', 'manual')),
    ADD CONSTRAINT orders_manual_number_key UNIQUE (manual_number),
    -- 종이에 적은 M 번호(M-001 → 1). 축제 전체 연속, 화면·CSV가 "M-001"로 보여 준다.
    ADD CONSTRAINT orders_manual_number_range CHECK (manual_number BETWEEN 1 AND 9999),
    -- 수기 주문만 종이 주문 시각과 수기 번호를 가진다.
    ADD CONSTRAINT orders_manual_fields_match_source CHECK (
        (source = 'manual') = (manual_ordered_at IS NOT NULL)
        AND (source = 'manual') = (manual_number IS NOT NULL)
    );

CREATE INDEX orders_manual_ordered_at_idx ON public.orders (manual_ordered_at)
    WHERE manual_ordered_at IS NOT NULL;

CREATE FUNCTION public.create_manual_order(
    p_idempotency_key uuid,
    p_payment_method public.payment_method,
    p_manual_ordered_at timestamptz,
    p_manual_number integer,
    p_actor_id uuid,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    -- 수기 주문의 pickup_number(정수·NOT NULL·UNIQUE)는 고객 번호와 겹치지 않는 구간에 둔다.
    -- 화면·CSV에는 manual_number를 "M-001"로 보여 준다(T-30 운영 매뉴얼의 M- 번호 체계).
    -- 수기 번호는 종이에 적힌 번호를 그대로 받는다 — 자동 발급하지 않는다(입력 순서와 종이 번호가 다를 수 있다).
    c_pickup_base constant integer := 2100000000;
    v_now constant timestamptz := now();
    v_order public.orders;
    v_item jsonb;
    v_idx integer;
    v_menu_id uuid;
    v_qty integer;
    v_option_ids uuid[];
    v_menu record;
    v_option_count integer;
    v_options_price integer;
    v_options jsonb;
    v_lines jsonb := '[]'::jsonb;
    v_line jsonb;
    v_shortages jsonb := '[]'::jsonb;
    v_total integer := 0;
    v_order_item_id uuid;
    v_created boolean := true;
    v_constraint text;
BEGIN
    -- create_order와 같은 잠금 키를 써서, 같은 멱등키의 고객·수기 요청이 서로 직렬화된다.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 20260925));
    SELECT * INTO v_order FROM public.orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_order.source <> 'manual' THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        v_created := false;
    ELSE
        IF p_manual_ordered_at IS NULL OR p_manual_ordered_at > v_now + interval '5 minutes' THEN
            RAISE EXCEPTION 'INVALID_MANUAL_ORDERED_AT';
        END IF;
        IF p_manual_number IS NULL OR p_manual_number NOT BETWEEN 1 AND 9999 THEN
            RAISE EXCEPTION 'INVALID_MANUAL_NUMBER';
        END IF;
        -- 같은 수기 번호의 요청을 직렬화한 뒤 중복을 확인한다. 그래도 겹치면 아래 UNIQUE가 막는다.
        PERFORM pg_advisory_xact_lock(hashtextextended('manual_number:' || p_manual_number::text, 20261006));
        IF EXISTS (SELECT 1 FROM public.orders WHERE manual_number = p_manual_number) THEN
            RAISE EXCEPTION 'MANUAL_NUMBER_TAKEN'
                USING DETAIL = jsonb_build_object('manualNumber', p_manual_number)::text;
        END IF;
        IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
            RAISE EXCEPTION 'EMPTY_ITEMS';
        END IF;

        -- 1) 항목 모양 검사(create_order와 같은 규칙).
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
            IF jsonb_typeof(v_item) <> 'object'
                OR jsonb_typeof(v_item->'menuItemId') IS DISTINCT FROM 'string'
                OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
                OR jsonb_typeof(coalesce(v_item->'optionIds', '[]'::jsonb)) <> 'array' THEN
                RAISE EXCEPTION 'INVALID_ITEMS';
            END IF;
            IF (v_item->>'menuItemId') !~ c_uuid
                OR (v_item->>'quantity')::numeric NOT BETWEEN 1 AND 99
                OR (v_item->>'quantity')::numeric <> trunc((v_item->>'quantity')::numeric)
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(coalesce(v_item->'optionIds', '[]'::jsonb)) o
                    WHERE jsonb_typeof(o) <> 'string' OR (o #>> '{}') !~ c_uuid
                ) THEN
                RAISE EXCEPTION 'INVALID_ITEMS';
            END IF;
        END LOOP;

        -- 2) 메뉴 행을 ID 순서로 잠근다 → 동시 주문(고객·수기)의 재고 변경이 직렬화되고 교착이 없다.
        PERFORM 1 FROM public.menu_items
        WHERE id IN (SELECT DISTINCT (value->>'menuItemId')::uuid FROM jsonb_array_elements(p_items))
        ORDER BY id
        FOR UPDATE;

        -- 3) 줄마다 가격·이름 스냅샷 계산. 종이 주문은 이미 판 것이라 비활성·수동 품절 메뉴와
        --    판매 중지된 옵션도 받는다. 가격은 DB 값만 쓴다(N-03).
        FOR v_item, v_idx IN SELECT value, ordinality - 1 FROM jsonb_array_elements(p_items) WITH ORDINALITY LOOP
            v_menu_id := (v_item->>'menuItemId')::uuid;
            v_qty := (v_item->>'quantity')::integer;
            SELECT coalesce(array_agg(o #>> '{}'), '{}')::uuid[] INTO v_option_ids
            FROM jsonb_array_elements(coalesce(v_item->'optionIds', '[]'::jsonb)) o;

            SELECT m.base_price, ko.name AS name_ko, en.name AS name_en
            INTO v_menu
            FROM public.menu_items m
            LEFT JOIN public.menu_item_translations ko ON ko.menu_item_id = m.id AND ko.locale = 'ko'
            LEFT JOIN public.menu_item_translations en ON en.menu_item_id = m.id AND en.locale = 'en'
            WHERE m.id = v_menu_id;
            IF NOT FOUND OR v_menu.name_ko IS NULL THEN
                RAISE EXCEPTION 'MENU_UNAVAILABLE'
                    USING DETAIL = jsonb_build_object('menuItemId', v_menu_id)::text;
            END IF;

            -- 선택 옵션: 중복 없음, 이 메뉴의 그룹에 속함, 한국어 이름 있음.
            SELECT count(*), coalesce(sum(op.extra_price), 0),
                   coalesce(jsonb_agg(jsonb_build_object(
                       'optionId', op.id, 'groupNameKo', gko.name, 'nameKo', oko.name,
                       'nameEn', oen.name, 'extraPrice', op.extra_price)
                       ORDER BY g.sort_order, op.sort_order, op.id), '[]'::jsonb)
            INTO v_option_count, v_options_price, v_options
            FROM public.options op
            JOIN public.option_groups g ON g.id = op.option_group_id
            JOIN public.option_group_translations gko ON gko.option_group_id = g.id AND gko.locale = 'ko'
            JOIN public.option_translations oko ON oko.option_id = op.id AND oko.locale = 'ko'
            LEFT JOIN public.option_translations oen ON oen.option_id = op.id AND oen.locale = 'en'
            WHERE op.id = ANY (v_option_ids)
              AND g.menu_item_id = v_menu_id;

            IF v_option_count <> cardinality(v_option_ids)
                OR cardinality(v_option_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_option_ids) x)
                OR EXISTS (
                    -- 그룹별 선택 수: 최대는 모든 그룹, 최소는 지금 판매 중인 그룹에만 적용한다.
                    SELECT 1
                    FROM public.option_groups g
                    CROSS JOIN LATERAL (
                        SELECT count(*) AS picked FROM public.options op
                        WHERE op.option_group_id = g.id AND op.id = ANY (v_option_ids)
                    ) s
                    WHERE g.menu_item_id = v_menu_id
                      AND (s.picked > g.max_select OR (g.is_active AND s.picked < g.min_select))
                ) THEN
                RAISE EXCEPTION 'INVALID_OPTION'
                    USING DETAIL = jsonb_build_object('menuItemId', v_menu_id)::text;
            END IF;

            v_lines := v_lines || jsonb_build_array(jsonb_build_object(
                'sortOrder', v_idx, 'menuItemId', v_menu_id, 'quantity', v_qty,
                'unitPrice', v_menu.base_price, 'optionsPrice', v_options_price,
                'lineTotal', (v_menu.base_price + v_options_price) * v_qty,
                'nameKo', v_menu.name_ko, 'nameEn', v_menu.name_en, 'options', v_options));
            v_total := v_total + (v_menu.base_price + v_options_price) * v_qty;
        END LOOP;

        -- 4) 재고가 모자란 메뉴는 막지 않고 응답으로 알려 준다(DECISIONS #62 — 화면은 경고).
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'menuItemId', m.id, 'requested', d.qty, 'available', m.stock) ORDER BY m.id), '[]'::jsonb)
        INTO v_shortages
        FROM (SELECT (l->>'menuItemId')::uuid AS menu_id, sum((l->>'quantity')::integer) AS qty
              FROM jsonb_array_elements(v_lines) l GROUP BY 1) d
        JOIN public.menu_items m ON m.id = d.menu_id
        WHERE m.stock < d.qty;

        -- 5) 쓰기. 이 블록 안의 변경은 멱등키 충돌 시 함께 되돌아간다.
        BEGIN
            -- 재고는 0에서 멈춘다(음수 금지).
            UPDATE public.menu_items m
            SET stock = greatest(m.stock - d.qty, 0)
            FROM (SELECT (l->>'menuItemId')::uuid AS menu_id, sum((l->>'quantity')::integer) AS qty
                  FROM jsonb_array_elements(v_lines) l GROUP BY 1) d
            WHERE m.id = d.menu_id;

            -- 완료 상태로 바로 저장한다. 결제·완료 시각은 종이 주문 시각, 미확인 강조가 뜨지 않게 확인 처리까지 한다.
            INSERT INTO public.orders
                (pickup_number, status, payment_method, total_amount, idempotency_key, status_token, locale,
                 source, manual_ordered_at, manual_number,
                 paid_at, completed_at, acknowledged_at, acknowledged_by)
            VALUES
                (c_pickup_base + p_manual_number, 'completed', p_payment_method, v_total, p_idempotency_key,
                 encode(extensions.gen_random_bytes(32), 'hex'), 'ko',
                 'manual', p_manual_ordered_at, p_manual_number,
                 p_manual_ordered_at, p_manual_ordered_at, v_now, p_actor_id)
            RETURNING * INTO v_order;

            FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
                INSERT INTO public.order_items
                    (order_id, menu_item_id, menu_name_ko, menu_name_en, unit_price, quantity,
                     options_price, line_total, sort_order)
                VALUES
                    (v_order.id, (v_line->>'menuItemId')::uuid, v_line->>'nameKo', v_line->>'nameEn',
                     (v_line->>'unitPrice')::integer, (v_line->>'quantity')::integer,
                     (v_line->>'optionsPrice')::integer, (v_line->>'lineTotal')::integer,
                     (v_line->>'sortOrder')::integer)
                RETURNING id INTO v_order_item_id;

                INSERT INTO public.order_item_options
                    (order_item_id, option_id, option_group_name_ko, option_name_ko, option_name_en, extra_price)
                SELECT v_order_item_id, (o->>'optionId')::uuid, o->>'groupNameKo', o->>'nameKo',
                       o->>'nameEn', (o->>'extraPrice')::integer
                FROM jsonb_array_elements(v_line->'options') o;
            END LOOP;

            INSERT INTO public.order_status_history
                (order_id, from_status, to_status, action, actor_type, actor_id)
            VALUES (v_order.id, NULL, 'completed', 'manual_create', 'admin', p_actor_id);
        EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
            IF v_constraint IN ('orders_manual_number_key', 'orders_pickup_number_key') THEN
                RAISE EXCEPTION 'MANUAL_NUMBER_TAKEN'
                    USING DETAIL = jsonb_build_object('manualNumber', p_manual_number)::text;
            END IF;
            IF v_constraint <> 'orders_idempotency_key_key' THEN
                RAISE;
            END IF;
            SELECT * INTO STRICT v_order FROM public.orders WHERE idempotency_key = p_idempotency_key;
            IF v_order.source <> 'manual' THEN
                RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
            END IF;
            v_created := false;
            v_shortages := '[]'::jsonb;
        END;
    END IF;

    RETURN jsonb_build_object(
        'orderId', v_order.id,
        'manualNumber', v_order.manual_number,
        'status', v_order.status,
        'paymentMethod', v_order.payment_method,
        'totalAmount', v_order.total_amount,
        'manualOrderedAt', v_order.manual_ordered_at,
        'createdAt', v_order.created_at,
        'created', v_created,
        -- 재요청(created=false)에서는 빈 배열 — 처음 저장할 때의 부족 내역은 다시 계산하지 않는다.
        'stockShortages', CASE WHEN v_created THEN v_shortages ELSE '[]'::jsonb END);
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_order(uuid, public.payment_method, timestamptz, integer, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_order(uuid, public.payment_method, timestamptz, integer, uuid, jsonb)
    TO service_role;

-- T-21 get_stats: 수기 주문은 종이 주문 시각(manual_ordered_at)의 날짜에 넣는다.
-- 10-07 종이 주문을 10-08에 입력해도 10-07 매출이다. 그 밖의 주문은 created_at 그대로(0016과 같은 결과).
CREATE OR REPLACE FUNCTION public.get_stats(p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_date text := COALESCE(p_date, to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'));
    v_start timestamptz;
    v_end timestamptz;
    v_result jsonb;
BEGIN
    IF v_date <> 'all' THEN
        IF v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
            RAISE EXCEPTION 'date must be YYYY-MM-DD or all' USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_start := v_date::date::timestamp AT TIME ZONE 'Asia/Seoul';
        EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
            RAISE EXCEPTION 'date must be a valid calendar day' USING ERRCODE = '22023';
        END;
        v_end := (v_date::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul';
    END IF;

    WITH selected_orders AS MATERIALIZED (
        SELECT id, status, total_amount, created_at
        FROM public.orders
        WHERE v_date = 'all'
           OR (manual_ordered_at IS NULL AND created_at >= v_start AND created_at < v_end)
           OR (manual_ordered_at >= v_start AND manual_ordered_at < v_end)
    ), summary AS (
        SELECT
            COALESCE(sum(total_amount) FILTER (WHERE status IN ('paid', 'cooking', 'completed')), 0) AS sales,
            count(*) FILTER (WHERE status IN ('paid', 'cooking', 'completed', 'refunded')) AS order_count,
            COALESCE(sum(total_amount) FILTER (WHERE status = 'refunded'), 0) AS refunded_amount,
            count(*) FILTER (WHERE status = 'refunded') AS refunded_count,
            count(*) FILTER (WHERE status = 'pending') AS pending_count,
            count(*) FILTER (WHERE status = 'paid') AS paid_count,
            count(*) FILTER (WHERE status = 'cooking') AS cooking_count,
            count(*) FILTER (WHERE status = 'completed') AS completed_count,
            count(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
            count(*) FILTER (WHERE status = 'expired') AS expired_count
        FROM selected_orders
    ), menu_quantities AS (
        SELECT oi.menu_item_id, min(oi.menu_name_ko) AS name_ko, sum(oi.quantity) AS quantity
        FROM selected_orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.status IN ('paid', 'cooking', 'completed')
        GROUP BY oi.menu_item_id
    ), menu_ratios AS (
        SELECT menu_item_id, name_ko, quantity,
            quantity::numeric / sum(quantity) OVER () AS ratio
        FROM menu_quantities
    ), menu_series AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'menuItemId', menu_item_id,
            'nameKo', name_ko,
            'quantity', quantity,
            'ratio', ratio
        ) ORDER BY quantity DESC, menu_item_id), '[]'::jsonb) AS value
        FROM menu_ratios
    )
    SELECT jsonb_build_object(
        'date', v_date,
        'sales', s.sales,
        'orderCount', s.order_count,
        'refundedAmount', s.refunded_amount,
        'refundedCount', s.refunded_count,
        'byMenu', m.value,
        'totals', jsonb_build_object(
            'pending', s.pending_count, 'paid', s.paid_count,
            'cooking', s.cooking_count, 'completed', s.completed_count,
            'cancelled', s.cancelled_count, 'refunded', s.refunded_count,
            'expired', s.expired_count
        )
    ) INTO v_result
    FROM summary s CROSS JOIN menu_series m;

    RETURN v_result;
END;
$$;

COMMIT;
