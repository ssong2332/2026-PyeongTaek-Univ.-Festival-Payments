-- 0007·0008·0009·0011 적용 후 실제 T-14 함수와 검증. 대역 없음.
DO $$ BEGIN
    IF current_database() <> 'festival_sweep_test' THEN
        RAISE EXCEPTION 'sweep test requires festival_sweep_test database';
    END IF;
END $$;
BEGIN;
INSERT INTO public.menu_items (id, base_price, stock)
VALUES ('11111111-1111-1111-1111-111111111111', 2000, 5);
INSERT INTO public.orders (
    id, pickup_number, payment_method, total_amount, idempotency_key, status_token, created_at
) VALUES (
    '22222222-2222-2222-2222-222222222222', 1, 'cash', 4000,
    gen_random_uuid(), 't18-test-only', now() - interval '10 minutes'
);
INSERT INTO public.order_items (
    order_id, menu_item_id, menu_name_ko, unit_price, quantity, options_price, line_total
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111', '테스트', 2000, 2, 0, 4000
);
DO $$ BEGIN
    IF public.sweep_order_timeouts() <> '{"expired":1,"completed":0}'::jsonb
        OR public.sweep_order_timeouts() <> '{"expired":0,"completed":0}'::jsonb THEN
        RAISE EXCEPTION 'FAILED: actual transition/default clock/idempotency';
    END IF;
    IF (SELECT stock FROM public.menu_items WHERE id = '11111111-1111-1111-1111-111111111111') <> 7
        OR (SELECT count(*) FROM public.order_status_history
            WHERE order_id = '22222222-2222-2222-2222-222222222222'
              AND from_status = 'pending' AND to_status = 'expired'
              AND action = 'expire' AND actor_type = 'system' AND actor_id IS NULL) <> 1
        OR NOT EXISTS (SELECT 1 FROM public.orders
            WHERE id = '22222222-2222-2222-2222-222222222222'
              AND status = 'expired' AND closed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'FAILED: stock restored once, system history and closed_at';
    END IF;
END $$;
ROLLBACK;
