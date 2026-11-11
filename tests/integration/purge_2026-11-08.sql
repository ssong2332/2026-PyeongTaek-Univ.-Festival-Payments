-- CI에서 리셋한 로컬 Supabase 전용 fixture 및 파기 결과 검증.
DO $$ BEGIN
    IF current_database() <> 'postgres' OR current_setting('application_name') <> 'festival_purge_test' THEN
        RAISE EXCEPTION 'purge test requires the reset local Supabase database';
    END IF;
END $$;

INSERT INTO public.menu_items (id, base_price, stock)
VALUES ('11111111-1111-1111-1111-111111111111', 2000, 40);
INSERT INTO public.menu_item_translations (menu_item_id, locale, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'ko', '테스트 호떡');
INSERT INTO public.option_groups (id, menu_item_id)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.options (id, option_group_id)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.app_settings (key, value) VALUES ('purge.test', 'keep');
INSERT INTO public.counters (key, value) VALUES ('pickup_number', 48), ('other_counter', 7);
INSERT INTO public.shifts (person_name, date, starts_at, ends_at, role)
VALUES ('테스트 근무자', DATE '2026-11-07', TIME '09:00', TIME '10:00', 'worker');
INSERT INTO public.orders (id, pickup_number, status, payment_method,
                           total_amount, idempotency_key, status_token)
VALUES
 ('44444444-4444-4444-4444-444444444444', 42, 'completed', 'cash', 2000,
  '55555555-5555-5555-5555-555555555550', 'purge-completed-cash'),
 ('44444444-4444-4444-4444-444444444445', 43, 'pending', 'transfer', 2000,
  '55555555-5555-5555-5555-555555555551', 'purge-pending-transfer'),
 ('44444444-4444-4444-4444-444444444446', 44, 'paid', 'transfer', 2000,
  '55555555-5555-5555-5555-555555555552', 'purge-paid-transfer'),
 ('44444444-4444-4444-4444-444444444447', 45, 'cooking', 'transfer', 2000,
  '55555555-5555-5555-5555-555555555553', 'purge-cooking-transfer'),
 ('44444444-4444-4444-4444-444444444448', 46, 'cancelled', 'cash', 2000,
  '55555555-5555-5555-5555-555555555554', 'purge-cancelled-cash'),
 ('44444444-4444-4444-4444-444444444449', 47, 'refunded', 'transfer', 2000,
  '55555555-5555-5555-5555-555555555555', 'purge-refunded-transfer'),
 ('44444444-4444-4444-4444-44444444444a', 48, 'expired', 'cash', 2000,
  '55555555-5555-5555-5555-555555555556', 'purge-expired-cash');
INSERT INTO public.order_items (id, order_id, menu_item_id, menu_name_ko, unit_price, quantity, line_total)
SELECT gen_random_uuid(), id, '11111111-1111-1111-1111-111111111111', '테스트 호떡', 2000, 1, 2000
FROM public.orders;
INSERT INTO public.order_item_options (order_item_id, option_id, option_group_name_ko, option_name_ko, extra_price)
SELECT id, '33333333-3333-3333-3333-333333333333', '토핑', '추가', 0
FROM public.order_items WHERE order_id = '44444444-4444-4444-4444-444444444444';
INSERT INTO public.order_status_history (order_id, to_status, action, actor_type)
SELECT id, status, 'fixture', 'admin' FROM public.orders;
INSERT INTO public.reviews (order_id, rating, text)
VALUES ('44444444-4444-4444-4444-444444444444', 5, 'test');
INSERT INTO public.staff_calls (order_id)
VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO public.rate_limits (scope, key, window_start, count)
VALUES ('order', 'test-key', now(), 1);

-- 0104가 추가한 실제 수기 주문 함수로 현금·계좌이체 기록을 만든다.
SELECT public.create_manual_order(
    '66666666-6666-6666-6666-666666666661', 'cash', now() - interval '1 day', 1,
    '77777777-7777-7777-7777-777777777771',
    jsonb_build_array(jsonb_build_object(
        'menuItemId', '11111111-1111-1111-1111-111111111111', 'quantity', 1, 'optionIds', '[]'::jsonb)));
SELECT public.create_manual_order(
    '66666666-6666-6666-6666-666666666662', 'transfer', now() - interval '1 day', 2,
    '77777777-7777-7777-7777-777777777771',
    jsonb_build_array(jsonb_build_object(
        'menuItemId', '11111111-1111-1111-1111-111111111111', 'quantity', 1, 'optionIds', '[]'::jsonb)));

DO $$ BEGIN
    IF (SELECT count(*) FROM public.orders) <> 9
       OR (SELECT count(*) FROM public.orders WHERE source = 'manual') <> 2
       OR (SELECT count(DISTINCT status) FROM public.orders) <> 7
       OR (SELECT count(DISTINCT payment_method) FROM public.orders) <> 2
       OR (SELECT count(*) FROM public.order_items) <> 9
       OR (SELECT count(*) FROM public.order_item_options) <> 1
       OR (SELECT count(*) FROM public.order_status_history) <> 9
       OR (SELECT stock FROM public.menu_items WHERE id = '11111111-1111-1111-1111-111111111111') <> 38 THEN
        RAISE EXCEPTION 'purge fixture does not cover all order kinds';
    END IF;
END $$;
