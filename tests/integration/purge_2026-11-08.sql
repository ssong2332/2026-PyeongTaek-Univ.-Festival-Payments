-- festival_purge_test 전용 fixture 및 파기 결과 검증.
DO $$ BEGIN
    IF current_database() <> 'festival_purge_test' THEN
        RAISE EXCEPTION 'purge test requires festival_purge_test database';
    END IF;
END $$;

INSERT INTO public.menu_items (id, base_price, stock)
VALUES ('11111111-1111-1111-1111-111111111111', 2000, 37);
INSERT INTO public.option_groups (id, menu_item_id)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.options (id, option_group_id)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.app_settings (key, value) VALUES ('purge.test', 'keep');
INSERT INTO public.counters (key, value) VALUES ('pickup_number', 42), ('other_counter', 7);
INSERT INTO public.orders (id, pickup_number, status, payment_method, total_amount, idempotency_key, status_token)
VALUES ('44444444-4444-4444-4444-444444444444', 42, 'completed', 'cash', 2000,
        '55555555-5555-5555-5555-555555555555', 'purge-test-token');
INSERT INTO public.order_items (id, order_id, menu_item_id, menu_name_ko, unit_price, quantity, line_total)
VALUES ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111', '테스트 호떡', 2000, 1, 2000);
INSERT INTO public.order_item_options (order_item_id, option_id, option_group_name_ko, option_name_ko, extra_price)
VALUES ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333',
        '토핑', '추가', 0);
INSERT INTO public.order_status_history (order_id, to_status, action, actor_type)
VALUES ('44444444-4444-4444-4444-444444444444', 'completed', 'complete', 'admin');
INSERT INTO public.reviews (order_id, rating, text)
VALUES ('44444444-4444-4444-4444-444444444444', 5, 'test');
INSERT INTO public.staff_calls (order_id)
VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO public.rate_limits (scope, key, window_start, count)
VALUES ('order', 'test-key', now(), 1);
