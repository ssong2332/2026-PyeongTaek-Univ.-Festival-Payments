BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    called_at timestamptz NOT NULL DEFAULT now(),
    acknowledged_at timestamptz,
    acknowledged_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_calls_order_called_at ON public.staff_calls (order_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_calls_unacknowledged ON public.staff_calls (called_at DESC) WHERE acknowledged_at IS NULL;

ALTER TABLE public.staff_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_calls FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.staff_calls TO service_role;

CREATE OR REPLACE FUNCTION public.create_staff_call_if_allowed(
    p_order_id uuid,
    p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
    accepted boolean,
    retry_after_seconds integer,
    call_id uuid,
    call_called_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_latest timestamptz;
    v_call_id uuid;
    v_called_at timestamptz;
    v_retry integer;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text, 0));

    SELECT max(sc.called_at) INTO v_latest
    FROM public.staff_calls AS sc
    WHERE sc.order_id = p_order_id;

    IF v_latest IS NOT NULL AND p_now < v_latest + interval '120 seconds' THEN
        v_retry := greatest(1, ceil(extract(epoch FROM ((v_latest + interval '120 seconds') - p_now)))::integer);
        RETURN QUERY SELECT false, v_retry, NULL::uuid, NULL::timestamptz;
        RETURN;
    END IF;

    INSERT INTO public.staff_calls (order_id, called_at)
    VALUES (p_order_id, p_now)
    RETURNING id, called_at INTO v_call_id, v_called_at;

    RETURN QUERY SELECT true, 120, v_call_id, v_called_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_call_if_allowed(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_call_if_allowed(uuid, timestamptz) TO service_role;

COMMIT;
