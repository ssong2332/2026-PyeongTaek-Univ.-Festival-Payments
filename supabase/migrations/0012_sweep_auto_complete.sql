-- T-19 / ADR-0006. 0011의 만료 처리를 유지하고 자동 완료를 추가한다.
BEGIN;

CREATE OR REPLACE FUNCTION public.sweep_order_timeouts(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_minutes integer;
    v_order_id uuid;
    v_enabled text;
    v_complete_minutes integer;
    v_completed integer := 0;
    v_expired integer := 0;
BEGIN
    SELECT value::integer INTO v_minutes
    FROM public.app_settings WHERE key = 'payment.expire_minutes';
    v_minutes := COALESCE(v_minutes, 10);
    IF v_minutes NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'payment.expire_minutes must be between 1 and 120'
            USING ERRCODE = '22023';
    END IF;

    SELECT value INTO v_enabled
    FROM public.app_settings WHERE key = 'auto_complete.enabled';
    v_enabled := COALESCE(v_enabled, 'false');
    IF v_enabled NOT IN ('true', 'false') THEN
        RAISE EXCEPTION 'auto_complete.enabled must be true or false'
            USING ERRCODE = '22023';
    END IF;
    IF v_enabled = 'true' THEN
        SELECT value::integer INTO v_complete_minutes
        FROM public.app_settings WHERE key = 'auto_complete.minutes';
        v_complete_minutes := COALESCE(v_complete_minutes, 15);
        IF v_complete_minutes NOT BETWEEN 1 AND 120 THEN
            RAISE EXCEPTION 'auto_complete.minutes must be between 1 and 120'
                USING ERRCODE = '22023';
        END IF;
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

    IF v_enabled = 'true' THEN
        FOR v_order_id IN
            SELECT id FROM public.orders
            WHERE status = 'cooking'
              AND cooking_started_at <= p_now - make_interval(mins => v_complete_minutes)
            ORDER BY cooking_started_at, id
            FOR UPDATE SKIP LOCKED
        LOOP
            BEGIN
                PERFORM public.transition_order(
                    v_order_id, 'cooking', 'completed', 'auto_complete', 'system',
                    NULL, NULL, NULL
                );
                v_completed := v_completed + 1;
            EXCEPTION WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM <> 'STATE_CHANGED' THEN
                    RAISE;
                END IF;
            END;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('expired', v_expired, 'completed', v_completed);
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_order_timeouts(timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_order_timeouts(timestamptz) TO service_role;

COMMIT;
