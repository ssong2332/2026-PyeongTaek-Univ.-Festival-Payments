-- T-07·T-08 create_order — 주문 생성 단일 트랜잭션(ADR-0002, Architecture 2절 함수 표·2-1 번호 표).
-- Requires 0001(스키마), 0003(RLS), 0008(T-53: p_transfer_method 없음, payment_method = cash | transfer).
-- 가격은 DB의 base_price·extra_price만 쓴다(N-03). 실패는 RAISE EXCEPTION '<코드>' USING DETAIL = JSON 문자열.
--   EMPTY_ITEMS       p_items가 비었거나 배열이 아님
--   INVALID_ITEMS     항목 모양 오류(menuItemId·quantity 1..99·optionIds). API zod가 먼저 막으므로 방어용
--   MENU_UNAVAILABLE  없음·비활성·수동 품절 메뉴           DETAIL {"menuItemId"}
--   INVALID_OPTION    다른 메뉴·비활성·중복 옵션, min/max 위반 DETAIL {"menuItemId"}
--   OUT_OF_STOCK      재고 부족(재고 0 포함), 부족한 메뉴 전부  DETAIL [{"menuItemId","requested","available"}]
BEGIN;

-- status_token용 gen_random_bytes. Supabase는 기본으로 extensions 스키마에 설치돼 있어 보통 no-op이다.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION public.create_order(
    p_idempotency_key uuid,
    p_payment_method public.payment_method,
    p_locale text,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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
    v_shortages jsonb;
    v_total integer := 0;
    v_pickup bigint;
    v_order_item_id uuid;
    v_created boolean := true;
    v_constraint text;
BEGIN
    -- T-08: 같은 멱등키 요청을 직렬화하고, 이미 있으면 그 주문을 그대로 돌려준다(재고·번호 재사용 없음).
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 20260925));
    SELECT * INTO v_order FROM public.orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        v_created := false;
    ELSE
        IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
            RAISE EXCEPTION 'EMPTY_ITEMS';
        END IF;

        -- 1) 항목 모양 검사. 잠금 순서를 고정하기 위해 메뉴 ID를 먼저 모은다.
        -- SQL의 OR는 평가 순서를 보장하지 않으므로 형 변환 전에 단계별로 검사한다.
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

        -- 2) 주문에 나오는 메뉴 행을 ID 순서로 잠근다 → 동시 주문의 재고 판단이 직렬화되고 교착이 없다.
        PERFORM 1 FROM public.menu_items
        WHERE id IN (SELECT DISTINCT (value->>'menuItemId')::uuid FROM jsonb_array_elements(p_items))
        ORDER BY id
        FOR UPDATE;

        -- 3) 줄마다 판매 가능·옵션 검사, 가격·이름 스냅샷 계산.
        FOR v_item, v_idx IN SELECT value, ordinality - 1 FROM jsonb_array_elements(p_items) WITH ORDINALITY LOOP
            v_menu_id := (v_item->>'menuItemId')::uuid;
            v_qty := (v_item->>'quantity')::integer;
            SELECT coalesce(array_agg(o #>> '{}'), '{}')::uuid[] INTO v_option_ids
            FROM jsonb_array_elements(coalesce(v_item->'optionIds', '[]'::jsonb)) o;

            SELECT m.base_price, m.is_active, m.is_sold_out_manual,
                   ko.name AS name_ko, en.name AS name_en
            INTO v_menu
            FROM public.menu_items m
            LEFT JOIN public.menu_item_translations ko ON ko.menu_item_id = m.id AND ko.locale = 'ko'
            LEFT JOIN public.menu_item_translations en ON en.menu_item_id = m.id AND en.locale = 'en'
            WHERE m.id = v_menu_id;
            IF NOT FOUND OR NOT v_menu.is_active OR v_menu.is_sold_out_manual OR v_menu.name_ko IS NULL THEN
                RAISE EXCEPTION 'MENU_UNAVAILABLE'
                    USING DETAIL = jsonb_build_object('menuItemId', v_menu_id)::text;
            END IF;

            -- 선택 옵션: 중복 없음, 이 메뉴의 활성 그룹에 속한 활성 옵션, 한국어 이름 있음.
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
              AND op.is_active AND g.is_active AND g.menu_item_id = v_menu_id;

            IF v_option_count <> cardinality(v_option_ids)
                OR cardinality(v_option_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_option_ids) x)
                OR EXISTS (
                    SELECT 1 FROM public.option_groups g
                    WHERE g.menu_item_id = v_menu_id AND g.is_active
                      AND (SELECT count(*) FROM public.options op
                           WHERE op.option_group_id = g.id AND op.id = ANY (v_option_ids))
                          NOT BETWEEN g.min_select AND g.max_select
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

        -- 4) 메뉴별 수량 합계로 재고 판단. 부족한 메뉴를 모두 알려준다(재고 0도 OUT_OF_STOCK).
        SELECT jsonb_agg(jsonb_build_object('menuItemId', m.id, 'requested', d.qty, 'available', m.stock) ORDER BY m.id)
        INTO v_shortages
        FROM (SELECT (l->>'menuItemId')::uuid AS menu_id, sum((l->>'quantity')::integer) AS qty
              FROM jsonb_array_elements(v_lines) l GROUP BY 1) d
        JOIN public.menu_items m ON m.id = d.menu_id
        WHERE m.stock < d.qty;
        IF v_shortages IS NOT NULL THEN
            RAISE EXCEPTION 'OUT_OF_STOCK' USING DETAIL = v_shortages::text;
        END IF;

        -- 5) 쓰기. 이 블록 안의 변경은 멱등키 충돌 시 함께 되돌아간다(ADR-0002 7단계).
        BEGIN
            UPDATE public.menu_items m
            SET stock = m.stock - d.qty
            FROM (SELECT (l->>'menuItemId')::uuid AS menu_id, sum((l->>'quantity')::integer) AS qty
                  FROM jsonb_array_elements(v_lines) l GROUP BY 1) d
            WHERE m.id = d.menu_id;

            -- 픽업 번호: 축제 전체 연속, 날짜 리셋 없음, 롤백 시 번호도 롤백(F-09). 카운터 행이 없으면 1부터.
            INSERT INTO public.counters AS c (key, value) VALUES ('pickup_number', 1)
            ON CONFLICT (key) DO UPDATE SET value = c.value + 1
            RETURNING c.value INTO v_pickup;

            INSERT INTO public.orders
                (pickup_number, payment_method, total_amount, idempotency_key, status_token, locale)
            VALUES
                (v_pickup::integer, p_payment_method, v_total, p_idempotency_key,
                 encode(extensions.gen_random_bytes(32), 'hex'), coalesce(nullif(p_locale, ''), 'ko'))
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

            INSERT INTO public.order_status_history (order_id, from_status, to_status, action, actor_type)
            VALUES (v_order.id, NULL, 'pending', 'create', 'customer');
        EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
            IF v_constraint <> 'orders_idempotency_key_key' THEN
                RAISE;
            END IF;
            SELECT * INTO STRICT v_order FROM public.orders WHERE idempotency_key = p_idempotency_key;
            v_created := false;
        END;
    END IF;

    RETURN jsonb_build_object(
        'orderId', v_order.id,
        'pickupNumber', v_order.pickup_number,
        'statusToken', v_order.status_token,
        'status', v_order.status,
        'totalAmount', v_order.total_amount,
        'createdAt', v_order.created_at,
        'created', v_created);
END;
$$;

-- 0003의 함수 권한 루프는 0003 실행 시점의 함수만 처리하므로 여기서 직접 막는다(Architecture 3절).
REVOKE ALL ON FUNCTION public.create_order(uuid, public.payment_method, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, public.payment_method, text, jsonb) TO service_role;

COMMIT;
