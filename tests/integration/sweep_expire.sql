-- psql -v ON_ERROR_STOP=1 -d festival_sweep_test -f tests/integration/sweep_expire.sql
-- T-14 미병합 중에도 스윕의 대상 선정·위임·오류 처리를 독립 검증한다.
-- transition_order 테스트 대역은 이 트랜잭션 안에서만 존재하며 마지막에 롤백된다.
DO $$ BEGIN
    IF current_database() <> 'festival_sweep_test' THEN
        RAISE EXCEPTION 'sweep test requires festival_sweep_test database';
    END IF;
END $$;

BEGIN;
CREATE TEMP TABLE sweep_calls (
    order_id uuid, from_status public.order_status, to_status public.order_status,
    action text, actor_type public.actor_type, actor_id uuid, reason text,
    refund_channel public.refund_channel
);
CREATE TEMP TABLE sweep_failure (order_id uuid, message text);

CREATE OR REPLACE FUNCTION public.transition_order(
    p_order_id uuid, p_from public.order_status, p_to public.order_status,
    p_action text, p_actor_type public.actor_type, p_actor_id uuid,
    p_reason text, p_refund_channel public.refund_channel
) RETURNS public.orders LANGUAGE plpgsql AS $$
DECLARE v_order public.orders; v_error text;
BEGIN
    SELECT message INTO v_error FROM pg_temp.sweep_failure WHERE order_id = p_order_id;
    IF v_error IS NOT NULL THEN RAISE EXCEPTION '%', v_error; END IF;
    INSERT INTO pg_temp.sweep_calls VALUES (
        p_order_id, p_from, p_to, p_action, p_actor_type, p_actor_id, p_reason, p_refund_channel
    );
    -- 재고·이력을 구현하지 않는 spy. 실제 부수 효과는 T-14 통합 검증 대상이다.
    UPDATE public.orders SET status = p_to WHERE id = p_order_id RETURNING * INTO v_order;
    RETURN v_order;
END $$;

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %', label; END IF;
END $$;

CREATE FUNCTION pg_temp.add_order(
    n integer, age interval, method public.payment_method DEFAULT 'cash',
    state public.order_status DEFAULT 'pending', reported boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
    -- jsonb_populate_record는 0008 이전·이후 스키마 모두 지원한다.
    INSERT INTO public.orders SELECT (jsonb_populate_record(NULL::public.orders,
        jsonb_build_object(
            'id', v_id, 'pickup_number', n, 'status', state, 'payment_method', method,
            'transfer_method', CASE WHEN method = 'transfer' THEN 'bank' END,
            'total_amount', 2000, 'idempotency_key', gen_random_uuid(),
            'status_token', v_id::text, 'locale', 'ko',
            'created_at', '2026-09-25 12:00:00+00'::timestamptz - age,
            'updated_at', '2026-09-25 12:00:00+00'::timestamptz,
            'transfer_reported_at', CASE WHEN reported THEN '2026-09-25 11:01:00+00'::timestamptz END
        ))).*;
    RETURN v_id;
END $$;

DELETE FROM public.app_settings WHERE key = 'payment.expire_minutes';
SELECT pg_temp.add_order(1, interval '9 minutes 59 seconds');
SELECT pg_temp.add_order(2, interval '10 minutes');
SELECT pg_temp.add_order(3, interval '11 minutes', 'transfer');
SELECT pg_temp.add_order(4, interval '60 minutes', 'transfer', 'pending', true);
SELECT pg_temp.add_order(5, interval '60 minutes', 'transfer', 'paid');
SELECT pg_temp.add_order(6, interval '60 minutes', 'cash', 'cooking');
SELECT pg_temp.add_order(7, interval '60 minutes', 'cash', 'completed');
SELECT pg_temp.add_order(8, interval '60 minutes', 'cash', 'cancelled');
SELECT pg_temp.add_order(9, interval '60 minutes', 'cash', 'refunded');
SELECT pg_temp.add_order(10, interval '60 minutes', 'cash', 'expired');

SELECT pg_temp.assert_true(
    public.sweep_order_timeouts('2026-09-25 12:00:00+00') = '{"expired":2,"completed":0}'::jsonb,
    'default 10 minutes: cash + transfer expire at inclusive boundary'
);
SELECT pg_temp.assert_true(
    (SELECT array_agg(pickup_number ORDER BY pickup_number) FROM public.orders WHERE status = 'pending') = ARRAY[1,4],
    '9m59s and reported transfer remain pending; paid/cooking/terminal excluded'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) = 2 AND bool_and(from_status = 'pending' AND to_status = 'expired'
        AND action = 'expire' AND actor_type = 'system' AND actor_id IS NULL
        AND reason IS NULL AND refund_channel IS NULL) FROM pg_temp.sweep_calls),
    'all transitions delegated with exact ADR-0006 arguments'
);
SELECT pg_temp.assert_true(
    public.sweep_order_timeouts('2026-09-25 12:00:00+00') = '{"expired":0,"completed":0}'::jsonb,
    'repeated sweep is idempotent'
);

INSERT INTO public.app_settings(key, value) VALUES ('payment.expire_minutes', '20');
SELECT pg_temp.add_order(11, interval '19 minutes 59 seconds');
SELECT pg_temp.add_order(12, interval '20 minutes');
SELECT pg_temp.assert_true(
    public.sweep_order_timeouts('2026-09-25 12:00:00+00') = '{"expired":1,"completed":0}'::jsonb,
    'configured 20 minute boundary'
);
UPDATE public.app_settings SET value = '10' WHERE key = 'payment.expire_minutes';
SELECT pg_temp.assert_true(
    public.sweep_order_timeouts('2026-09-25 12:00:00+00') = '{"expired":1,"completed":0}'::jsonb,
    'changed setting takes effect on next call'
);

INSERT INTO pg_temp.sweep_failure SELECT pg_temp.add_order(13, interval '30 minutes'), 'STATE_CHANGED';
SELECT pg_temp.add_order(14, interval '25 minutes');
SELECT pg_temp.assert_true(
    public.sweep_order_timeouts('2026-09-25 12:00:00+00') = '{"expired":1,"completed":0}'::jsonb,
    'CAS failure is not counted and does not stop other orders'
);
DELETE FROM pg_temp.sweep_failure;
UPDATE public.orders SET status = 'paid' WHERE pickup_number = 13;

SELECT pg_temp.add_order(15, interval '40 minutes');
INSERT INTO pg_temp.sweep_failure SELECT pg_temp.add_order(16, interval '35 minutes'), 'unexpected failure';
DO $$ BEGIN
    BEGIN
        PERFORM public.sweep_order_timeouts('2026-09-25 12:00:00+00');
        RAISE EXCEPTION 'FAILED: unexpected error was swallowed';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM <> 'unexpected failure' THEN RAISE; END IF;
    END;
    PERFORM pg_temp.assert_true(
        (SELECT count(*) = 2 FROM public.orders WHERE pickup_number IN (15,16) AND status = 'pending'),
        'unexpected error rolls back earlier transitions'
    );
END $$;

UPDATE public.app_settings SET value = '0' WHERE key = 'payment.expire_minutes';
DO $$ BEGIN
    BEGIN
        PERFORM public.sweep_order_timeouts('2026-09-25 12:00:00+00');
        RAISE EXCEPTION 'FAILED: invalid setting accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
END $$;

SELECT pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.sweep_order_timeouts(timestamptz)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.sweep_order_timeouts(timestamptz)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.sweep_order_timeouts(timestamptz)', 'EXECUTE'),
    'only service_role can execute'
);
SELECT pg_temp.assert_true(
    (SELECT NOT prosecdef AND pronargdefaults = 1 FROM pg_proc
     WHERE oid = 'public.sweep_order_timeouts(timestamptz)'::regprocedure),
    'security invoker and optional clock argument'
);
ROLLBACK;
