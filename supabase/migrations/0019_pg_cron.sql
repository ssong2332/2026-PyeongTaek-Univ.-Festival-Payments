-- T-18/T-19 · ADR-0006. pg_cron이 제공되는 환경에만 1분 스윕을 등록한다.
-- 같은 이름으로 다시 schedule하면 기존 작업이 갱신되므로 재실행해도 중복 잡이 생기지 않는다.
DO $$
BEGIN
    IF to_regprocedure('public.sweep_order_timeouts(timestamptz)') IS NULL THEN
        RAISE EXCEPTION '0012_sweep_auto_complete.sql must be applied before pg_cron';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron is unavailable; use the authenticated dashboard sweep fallback';
        RETURN;
    END IF;

    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
    EXECUTE $cron$
        SELECT cron.schedule(
            'sweep-orders', '* * * * *',
            'SELECT public.sweep_order_timeouts()'
        )
    $cron$;
END;
$$;
