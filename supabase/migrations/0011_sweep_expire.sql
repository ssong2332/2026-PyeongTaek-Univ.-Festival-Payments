-- T-18 / ADR-0006. 운영 적용은 0008 → 0009(transition_order) 이후.
-- T-19는 0012에서 이 함수를 확장한다. 이 단계의 completed는 항상 0이다.
BEGIN;

CREATE FUNCTION public.sweep_order_timeouts(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_minutes integer;
    v_order_id uuid;
    v_expired integer := 0;
BEGIN
    SELECT value::integer INTO v_minutes
    FROM public.app_settings WHERE key = 'payment.expire_minutes';
    v_minutes := COALESCE(v_minutes, 10);
    IF v_minutes NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'payment.expire_minutes must be between 1 and 120'
            USING ERRCODE = '22023';
    END IF;

    -- 행 잠금으로 대상 선정과 전환 사이의 송금 신고 경쟁도 막는다.
    -- 다른 스윕/관리자가 처리 중인 행은 다음 스윕에서 재평가한다.
    FOR v_order_id IN
        SELECT id FROM public.orders
        WHERE status = 'pending'
          AND transfer_reported_at IS NULL
          AND created_at <= p_now - make_interval(mins => v_minutes)
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            PERFORM public.transition_order(
                v_order_id, 'pending', 'expired', 'expire', 'system',
                NULL, NULL, NULL
            );
            v_expired := v_expired + 1;
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
            -- CAS 충돌만 건너뛴다. DB 장애·규격 불일치를 성공으로 숨기지 않는다.
            IF SQLERRM <> 'STATE_CHANGED' THEN
                RAISE;
            END IF;
        END;
    END LOOP;

    RETURN jsonb_build_object('expired', v_expired, 'completed', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_order_timeouts(timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_order_timeouts(timestamptz) TO service_role;

COMMIT;
