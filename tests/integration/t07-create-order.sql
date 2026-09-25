-- T-07·T-08 create_order(0010) 단일 세션 검증. 전체 마이그레이션 적용 후 격리 DB에서 실행한다.
-- 계약: ADR-0002, Architecture 2절 함수 표·5절 에러 표. 테스트 데이터는 마지막 ROLLBACK으로 되돌린다.
BEGIN;

-- 권한: service_role만 실행, 브라우저 역할은 실행 불가. SECURITY INVOKER + 고정 search_path.
DO $$
DECLARE
    fn regprocedure := 'public.create_order(uuid, public.payment_method, text, jsonb)'::regprocedure;
BEGIN
    IF has_function_privilege('anon', fn, 'EXECUTE')
        OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'Browser role can execute create_order';
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role cannot execute create_order';
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
        RAISE EXCEPTION 'create_order must be SECURITY INVOKER';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn AND proconfig @> ARRAY['search_path=pg_catalog']) THEN
        RAISE EXCEPTION 'create_order must pin search_path';
    END IF;
END $$;

-- 고정 픽스처: 메뉴 A(3000원, 재고 5, 토핑 그룹 0~2개), 메뉴 B(2000원, 재고 1), 비활성 C, 수동 품절 D,
-- 재고 0 E, 필수 그룹(정확히 1개)이 있는 F.
INSERT INTO public.menu_items (id, base_price, stock, is_active, is_sold_out_manual) VALUES
    ('07000000-0000-4000-8000-00000000000a', 3000, 5, true,  false),
    ('07000000-0000-4000-8000-00000000000b', 2000, 1, true,  false),
    ('07000000-0000-4000-8000-00000000000c', 1000, 5, false, false),
    ('07000000-0000-4000-8000-00000000000d', 1000, 5, true,  true),
    ('07000000-0000-4000-8000-00000000000e', 1000, 0, true,  false),
    ('07000000-0000-4000-8000-00000000000f', 4000, 5, true,  false);
INSERT INTO public.menu_item_translations (menu_item_id, locale, name) VALUES
    ('07000000-0000-4000-8000-00000000000a', 'ko', '씨앗호떡'),
    ('07000000-0000-4000-8000-00000000000a', 'en', 'Seed Hotteok'),
    ('07000000-0000-4000-8000-00000000000b', 'ko', '꿀호떡'),
    ('07000000-0000-4000-8000-00000000000c', 'ko', '비활성'),
    ('07000000-0000-4000-8000-00000000000d', 'ko', '수동품절'),
    ('07000000-0000-4000-8000-00000000000e', 'ko', '재고없음'),
    ('07000000-0000-4000-8000-00000000000f', 'ko', '세트');
INSERT INTO public.option_groups (id, menu_item_id, min_select, max_select, sort_order) VALUES
    ('07100000-0000-4000-8000-00000000000a', '07000000-0000-4000-8000-00000000000a', 0, 2, 0),
    ('07100000-0000-4000-8000-00000000000f', '07000000-0000-4000-8000-00000000000f', 1, 1, 0);
INSERT INTO public.option_group_translations (option_group_id, locale, name) VALUES
    ('07100000-0000-4000-8000-00000000000a', 'ko', '토핑'),
    ('07100000-0000-4000-8000-00000000000f', 'ko', '음료');
INSERT INTO public.options (id, option_group_id, extra_price, sort_order, is_active) VALUES
    ('07200000-0000-4000-8000-000000000001', '07100000-0000-4000-8000-00000000000a', 500, 0, true),
    ('07200000-0000-4000-8000-000000000002', '07100000-0000-4000-8000-00000000000a', 300, 1, true),
    ('07200000-0000-4000-8000-000000000003', '07100000-0000-4000-8000-00000000000a', 700, 2, true),
    ('07200000-0000-4000-8000-000000000004', '07100000-0000-4000-8000-00000000000a', 100, 3, false),
    ('07200000-0000-4000-8000-000000000005', '07100000-0000-4000-8000-00000000000f', 0,   0, true),
    ('07200000-0000-4000-8000-000000000006', '07100000-0000-4000-8000-00000000000f', 500, 1, true);
INSERT INTO public.option_translations (option_id, locale, name) VALUES
    ('07200000-0000-4000-8000-000000000001', 'ko', '치즈'),
    ('07200000-0000-4000-8000-000000000001', 'en', 'Cheese'),
    ('07200000-0000-4000-8000-000000000002', 'ko', '견과'),
    ('07200000-0000-4000-8000-000000000003', 'ko', '아이스크림'),
    ('07200000-0000-4000-8000-000000000004', 'ko', '비활성옵션'),
    ('07200000-0000-4000-8000-000000000005', 'ko', '콜라'),
    ('07200000-0000-4000-8000-000000000006', 'ko', '사이다');
-- CI의 로컬 Supabase에는 시드가 없으므로 카운터 행이 없는 상태도 함께 검증한다.
DELETE FROM public.counters WHERE key = 'pickup_number';

SET LOCAL ROLE service_role;

-- T-07: 서버 가격 재계산·스냅샷·재고 차감·이력. 카운터 행이 없으면 1번부터 시작한다.
DO $$
DECLARE
    r jsonb;
    v_order public.orders;
BEGIN
    r := public.create_order(
        '07300000-0000-4000-8000-000000000001', 'transfer', 'en',
        '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":2,
           "optionIds":["07200000-0000-4000-8000-000000000001","07200000-0000-4000-8000-000000000002"],
           "unitPrice":1,"totalAmount":1},
          {"menuItemId":"07000000-0000-4000-8000-00000000000b","quantity":1,"optionIds":[]}]'::jsonb);

    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) IS DISTINCT FROM
        ARRAY['created','createdAt','orderId','pickupNumber','status','statusToken','totalAmount'] THEN
        RAISE EXCEPTION 'Unexpected response keys: %', r;
    END IF;
    -- (3000 + 500 + 300) × 2 + 2000 × 1 = 9600. 클라이언트가 보낸 가격 필드는 무시된다(N-03).
    IF (r->>'totalAmount')::int <> 9600 OR r->>'status' <> 'pending' OR NOT (r->>'created')::boolean
        OR jsonb_typeof(r->'pickupNumber') <> 'number' OR (r->>'pickupNumber')::int <> 1 THEN
        RAISE EXCEPTION 'Unexpected create result: %', r;
    END IF;
    IF r->>'statusToken' !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Status token must be 64 hex chars: %', r->>'statusToken';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = (r->>'orderId')::uuid;
    IF v_order.payment_method <> 'transfer' OR v_order.locale <> 'en' OR v_order.total_amount <> 9600
        OR v_order.idempotency_key <> '07300000-0000-4000-8000-000000000001'
        OR v_order.status_token <> r->>'statusToken' OR v_order.pickup_number <> 1 THEN
        RAISE EXCEPTION 'Order row mismatch';
    END IF;
    IF (SELECT stock FROM public.menu_items WHERE id = '07000000-0000-4000-8000-00000000000a') <> 3
        OR (SELECT stock FROM public.menu_items WHERE id = '07000000-0000-4000-8000-00000000000b') <> 0 THEN
        RAISE EXCEPTION 'Stock was not decremented once per ordered unit';
    END IF;
    IF (SELECT value FROM public.counters WHERE key = 'pickup_number') <> 1 THEN
        RAISE EXCEPTION 'Pickup counter was not created at 1';
    END IF;

    IF (SELECT jsonb_agg(jsonb_build_array(menu_name_ko, menu_name_en, unit_price, options_price, quantity, line_total, sort_order) ORDER BY sort_order)
        FROM public.order_items WHERE order_id = v_order.id)
        IS DISTINCT FROM '[["씨앗호떡","Seed Hotteok",3000,800,2,7600,0],["꿀호떡",null,2000,0,1,2000,1]]'::jsonb THEN
        RAISE EXCEPTION 'Order item snapshot mismatch';
    END IF;
    IF (SELECT jsonb_agg(jsonb_build_array(o.option_group_name_ko, o.option_name_ko, o.option_name_en, o.extra_price) ORDER BY o.extra_price DESC)
        FROM public.order_item_options o JOIN public.order_items i ON i.id = o.order_item_id
        WHERE i.order_id = v_order.id)
        IS DISTINCT FROM '[["토핑","치즈","Cheese",500],["토핑","견과",null,300]]'::jsonb THEN
        RAISE EXCEPTION 'Order option snapshot mismatch';
    END IF;
    IF (SELECT jsonb_agg(jsonb_build_array(from_status, to_status, action, actor_type, actor_id))
        FROM public.order_status_history WHERE order_id = v_order.id)
        IS DISTINCT FROM '[[null,"pending","create","customer",null]]'::jsonb THEN
        RAISE EXCEPTION 'Creation history mismatch';
    END IF;
END $$;

-- T-08: 같은 멱등키 재요청은 같은 응답(created=false)을 주고 재고·픽업 번호를 다시 쓰지 않는다.
DO $$
DECLARE
    first_r jsonb;
    again jsonb;
BEGIN
    first_r := public.create_order('07300000-0000-4000-8000-000000000002', 'cash', 'ko',
        '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":[]}]');
    -- 두 번째 요청은 내용이 달라도 첫 주문을 그대로 돌려준다.
    again := public.create_order('07300000-0000-4000-8000-000000000002', 'transfer', 'en',
        '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":2,"optionIds":[]}]');
    IF again <> (first_r || '{"created":false}'::jsonb) THEN
        RAISE EXCEPTION 'Idempotent replay mismatch: % vs %', first_r, again;
    END IF;
    IF (SELECT count(*) FROM public.orders WHERE idempotency_key = '07300000-0000-4000-8000-000000000002') <> 1
        OR (SELECT stock FROM public.menu_items WHERE id = '07000000-0000-4000-8000-00000000000a') <> 2
        OR (SELECT value FROM public.counters WHERE key = 'pickup_number') <> 2 THEN
        RAISE EXCEPTION 'Replay changed stock, counter or order count';
    END IF;
END $$;

-- T-08: 픽업 번호는 날짜와 무관하게 이어진다(150 → 151 → 152). 토큰은 주문마다 다르다.
UPDATE public.counters SET value = 150 WHERE key = 'pickup_number';
DO $$
DECLARE
    a jsonb;
    b jsonb;
BEGIN
    a := public.create_order('07300000-0000-4000-8000-000000000003', 'cash', 'ko',
        '[{"menuItemId":"07000000-0000-4000-8000-00000000000f","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000006"]}]');
    b := public.create_order('07300000-0000-4000-8000-000000000004', 'cash', 'ko',
        '[{"menuItemId":"07000000-0000-4000-8000-00000000000f","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000005"]}]');
    IF (a->>'pickupNumber')::int <> 151 OR (b->>'pickupNumber')::int <> 152 THEN
        RAISE EXCEPTION 'Pickup numbers not continuous: %, %', a->>'pickupNumber', b->>'pickupNumber';
    END IF;
    IF a->>'statusToken' = b->>'statusToken' THEN
        RAISE EXCEPTION 'Status tokens must differ';
    END IF;
    IF (a->>'totalAmount')::int <> 4500 OR (b->>'totalAmount')::int <> 4000 THEN
        RAISE EXCEPTION 'Required option group price mismatch';
    END IF;
END $$;

-- 실패 경로: 코드·DETAIL(JSON)을 확인하고, 실패한 호출이 재고·카운터·주문을 남기지 않는지 본다.
CREATE TEMP TABLE t07_failures (label text, items jsonb, code text, detail jsonb);
GRANT ALL ON t07_failures TO service_role;
INSERT INTO t07_failures (label, items, code, detail) VALUES
    ('empty array', '[]', 'EMPTY_ITEMS', NULL),
    ('null items', NULL, 'EMPTY_ITEMS', NULL),
    ('not an array', '{"menuItemId":"07000000-0000-4000-8000-00000000000a"}', 'EMPTY_ITEMS', NULL),
    ('inactive menu', '[{"menuItemId":"07000000-0000-4000-8000-00000000000c","quantity":1,"optionIds":[]}]',
        'MENU_UNAVAILABLE', '{"menuItemId":"07000000-0000-4000-8000-00000000000c"}'),
    ('manual sold out', '[{"menuItemId":"07000000-0000-4000-8000-00000000000d","quantity":1,"optionIds":[]}]',
        'MENU_UNAVAILABLE', '{"menuItemId":"07000000-0000-4000-8000-00000000000d"}'),
    ('unknown menu', '[{"menuItemId":"07000000-0000-4000-8000-000000000099","quantity":1,"optionIds":[]}]',
        'MENU_UNAVAILABLE', '{"menuItemId":"07000000-0000-4000-8000-000000000099"}'),
    ('stock zero', '[{"menuItemId":"07000000-0000-4000-8000-00000000000e","quantity":1,"optionIds":[]}]',
        'OUT_OF_STOCK', '[{"menuItemId":"07000000-0000-4000-8000-00000000000e","requested":1,"available":0}]'),
    ('stock short across lines, all reported',
        '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":2,"optionIds":[]},
          {"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":[]},
          {"menuItemId":"07000000-0000-4000-8000-00000000000b","quantity":1,"optionIds":[]}]',
        'OUT_OF_STOCK', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","requested":3,"available":2},
                          {"menuItemId":"07000000-0000-4000-8000-00000000000b","requested":1,"available":0}]'),
    ('option of other menu', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000005"]}]',
        'INVALID_OPTION', '{"menuItemId":"07000000-0000-4000-8000-00000000000a"}'),
    ('inactive option', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000004"]}]',
        'INVALID_OPTION', '{"menuItemId":"07000000-0000-4000-8000-00000000000a"}'),
    ('duplicate option', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000001","07200000-0000-4000-8000-000000000001"]}]',
        'INVALID_OPTION', '{"menuItemId":"07000000-0000-4000-8000-00000000000a"}'),
    ('over max_select', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000001","07200000-0000-4000-8000-000000000002","07200000-0000-4000-8000-000000000003"]}]',
        'INVALID_OPTION', '{"menuItemId":"07000000-0000-4000-8000-00000000000a"}'),
    ('under min_select', '[{"menuItemId":"07000000-0000-4000-8000-00000000000f","quantity":1,"optionIds":[]}]',
        'INVALID_OPTION', '{"menuItemId":"07000000-0000-4000-8000-00000000000f"}'),
    ('unknown option id', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":["07200000-0000-4000-8000-000000000099"]}]',
        'INVALID_OPTION', '{"menuItemId":"07000000-0000-4000-8000-00000000000a"}'),
    ('zero quantity', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":0,"optionIds":[]}]',
        'INVALID_ITEMS', NULL),
    ('fractional quantity', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1.5,"optionIds":[]}]',
        'INVALID_ITEMS', NULL),
    ('missing menu id', '[{"quantity":1,"optionIds":[]}]', 'INVALID_ITEMS', NULL),
    ('bad option id', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":["nope"]}]',
        'INVALID_ITEMS', NULL),
    -- 앞 줄은 성공 조건을 만족해도 뒷 줄이 실패하면 전부 롤백된다(아래 불변 검사).
    ('rollback whole order', '[{"menuItemId":"07000000-0000-4000-8000-00000000000a","quantity":1,"optionIds":[]},
                               {"menuItemId":"07000000-0000-4000-8000-00000000000d","quantity":1,"optionIds":[]}]',
        'MENU_UNAVAILABLE', '{"menuItemId":"07000000-0000-4000-8000-00000000000d"}');

DO $$
DECLARE
    f record;
    got_code text;
    got_detail text;
    stock_before int[];
    counter_before bigint;
    orders_before bigint;
BEGIN
    SELECT array_agg(stock ORDER BY id) INTO stock_before FROM public.menu_items WHERE id::text LIKE '07000000-%';
    SELECT value INTO counter_before FROM public.counters WHERE key = 'pickup_number';
    SELECT count(*) INTO orders_before FROM public.orders;
    FOR f IN SELECT * FROM t07_failures LOOP
        got_code := NULL;
        BEGIN
            PERFORM public.create_order(gen_random_uuid(), 'cash', 'ko', f.items);
        EXCEPTION WHEN raise_exception THEN
            GET STACKED DIAGNOSTICS got_code = MESSAGE_TEXT, got_detail = PG_EXCEPTION_DETAIL;
        END;
        IF got_code IS DISTINCT FROM f.code THEN
            RAISE EXCEPTION '[%] expected %, got %', f.label, f.code, got_code;
        END IF;
        IF f.detail IS NOT NULL AND (NULLIF(got_detail, '')::jsonb IS DISTINCT FROM f.detail) THEN
            RAISE EXCEPTION '[%] detail mismatch: %', f.label, got_detail;
        END IF;
    END LOOP;
    IF (SELECT array_agg(stock ORDER BY id) FROM public.menu_items WHERE id::text LIKE '07000000-%') IS DISTINCT FROM stock_before
        OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM counter_before
        OR (SELECT count(*) FROM public.orders) <> orders_before THEN
        RAISE EXCEPTION 'A failed create_order left stock, counter or orders changed';
    END IF;
END $$;

RESET ROLE;
ROLLBACK;
