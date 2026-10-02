-- T-11: 대기인원 집계 함수 (Architecture 2-1절, PRD F-11)
BEGIN;

CREATE OR REPLACE FUNCTION public.count_waiting_before(p_created_at timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
    SELECT count(*)::integer
    FROM public.orders
    WHERE status IN ('pending', 'paid', 'cooking')
      AND (p_created_at IS NULL OR created_at < p_created_at);
$$;

REVOKE ALL ON FUNCTION public.count_waiting_before(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_waiting_before(timestamptz) TO service_role;

COMMIT;
