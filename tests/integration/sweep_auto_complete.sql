-- 독립 DB 전용, 실제 transition_order를 사용하고 모든 fixture는 롤백한다.
DO $$ BEGIN
    IF current_database() <> 'festival_sweep_test' THEN
        RAISE EXCEPTION 'requires festival_sweep_test database';
    END IF;
END $$;
BEGIN;
DELETE FROM public.app_settings WHERE key LIKE 'auto_complete.%';
INSERT INTO public.menu_items (id, base_price, stock)
VALUES ('11111111-1111-1111-1111-111111111119', 2000, 5);
INSERT INTO public.orders (id, pickup_number, payment_method, total_amount,
    idempotency_key, status_token, status, created_at, cooking_started_at)
SELECT ('22222222-2222-2222-2222-' || lpad(n::text, 12, '0'))::uuid,
    n, 'cash', 2000, gen_random_uuid(), 't19-test-' || n,
    CASE WHEN n = 3 THEN 'paid'::public.order_status ELSE 'cooking'::public.order_status END,
    now() - interval '1 hour',
    CASE WHEN n = 4 THEN NULL ELSE now() - interval '15 minutes' END
FROM generate_series(1, 4) AS n;
INSERT INTO public.order_items (order_id, menu_item_id, menu_name_ko, unit_price, quantity, options_price, line_total)
VALUES ('22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-111111111119', '테스트', 2000, 1, 0, 2000);
DO $$ BEGIN
    IF public.sweep_order_timeouts() <> '{"expired":0,"completed":0}'::jsonb THEN
        RAISE EXCEPTION 'default OFF must not complete';
    END IF;
END $$;
INSERT INTO public.app_settings (key, value) VALUES ('auto_complete.enabled', 'false');
DO $$ BEGIN
    IF public.sweep_order_timeouts() <> '{"expired":0,"completed":0}'::jsonb THEN
        RAISE EXCEPTION 'explicit OFF must not complete';
    END IF;
END $$;
UPDATE public.app_settings SET value = 'true' WHERE key = 'auto_complete.enabled';
DO $$ BEGIN
    IF public.sweep_order_timeouts(now() - interval '1 second') <> '{"expired":0,"completed":0}'::jsonb THEN
        RAISE EXCEPTION '14m59s must not complete';
    END IF;
    IF public.sweep_order_timeouts() <> '{"expired":0,"completed":2}'::jsonb THEN
        RAISE EXCEPTION 'default 15m must complete cooking only';
    END IF;
    IF public.sweep_order_timeouts() <> '{"expired":0,"completed":0}'::jsonb THEN
        RAISE EXCEPTION 'repeat must be idempotent';
    END IF;
    IF (SELECT count(*) FROM public.order_status_history WHERE action = 'auto_complete'
        AND actor_type = 'system' AND actor_id IS NULL AND from_status = 'cooking'
        AND to_status = 'completed') <> 2
        OR (SELECT count(*) FROM public.orders WHERE status = 'completed' AND completed_at IS NOT NULL) <> 2
        OR (SELECT stock FROM public.menu_items WHERE id = '11111111-1111-1111-1111-111111111119') <> 5 THEN
        RAISE EXCEPTION 'system history/timestamp/stock invariant';
    END IF;
END $$;
-- 설정 변경은 다음 호출부터 기존 cooking 주문에도 즉시 반영한다.
UPDATE public.orders SET cooking_started_at = now() - interval '20 minutes'
WHERE id = '22222222-2222-2222-2222-000000000004';
INSERT INTO public.app_settings (key, value) VALUES ('auto_complete.minutes', '21');
DO $$ BEGIN
    IF public.sweep_order_timeouts() <> '{"expired":0,"completed":0}'::jsonb THEN
        RAISE EXCEPTION 'new 21m setting must be read';
    END IF;
END $$;
UPDATE public.app_settings SET value = '20' WHERE key = 'auto_complete.minutes';
DO $$ BEGIN
    IF public.sweep_order_timeouts() <> '{"expired":0,"completed":1}'::jsonb THEN
        RAISE EXCEPTION 'changed 20m setting must apply immediately';
    END IF;
END $$;
UPDATE public.app_settings SET value = '0' WHERE key = 'auto_complete.minutes';
DO $$ BEGIN
    BEGIN
        PERFORM public.sweep_order_timeouts();
        RAISE EXCEPTION 'invalid minutes accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
END $$;
ROLLBACK;
