-- 로컬 Supabase에서 0015가 지원 환경에 잡을 정확히 한 개 등록하는지 확인한다.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron unavailable: dashboard sweep fallback is required';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE EXCEPTION 'FAILED: pg_cron available but extension not installed';
    END IF;

    IF (SELECT count(*) FROM cron.job
        WHERE jobname = 'sweep-orders'
          AND schedule = '* * * * *'
          AND command = 'SELECT public.sweep_order_timeouts()'
          AND active) <> 1 THEN
        RAISE EXCEPTION 'FAILED: exactly one active one-minute sweep job required';
    END IF;
END;
$$;
