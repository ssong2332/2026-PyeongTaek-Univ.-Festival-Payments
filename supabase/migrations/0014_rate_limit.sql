-- T-51 / ADR-0009: 주문 생성 속도 제한 카운터 테이블 및 함수
BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limits (
    scope text NOT NULL,
    key text NOT NULL,
    window_start timestamptz NOT NULL,
    count int NOT NULL DEFAULT 0,
    CONSTRAINT pk_rate_limits PRIMARY KEY (scope, key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_scope text,
    p_key text,
    p_limit int,
    p_window_seconds int,
    p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_window_start timestamptz;
    v_new_count int;
BEGIN
    v_window_start := to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds);

    -- 1시간 지난 오래된 레코드 정리 (ADR-0009)
    DELETE FROM public.rate_limits
    WHERE window_start < p_now - interval '1 hour';

    -- 원자적 증가: 한도 미만일 때만 count 증가
    INSERT INTO public.rate_limits (scope, key, window_start, count)
    VALUES (p_scope, p_key, v_window_start, 1)
    ON CONFLICT (scope, key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    WHERE rate_limits.count < p_limit
    RETURNING count INTO v_new_count;

    IF v_new_count IS NULL THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, int, int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, int, int, timestamptz) TO service_role;

COMMIT;
