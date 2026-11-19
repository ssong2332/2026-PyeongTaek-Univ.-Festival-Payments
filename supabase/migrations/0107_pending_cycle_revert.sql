-- T-55: only a successful transfer cooking -> pending revert starts a new pending cycle.
-- Initial/legacy orders keep pending_since NULL and continue to expire from created_at.
BEGIN;

ALTER TABLE public.orders
    ADD COLUMN pending_since timestamptz,
    ADD COLUMN transfer_reported_history timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[];

-- The current transfer_reported_at is moved to history on revert, so the customer
-- may report again in the new cycle without losing the previous report timestamp.
CREATE FUNCTION public.revert_transfer_order_to_pending(
    p_order_id uuid,
    p_actor_id uuid,
    p_reason text
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.orders;
    v_now timestamptz;
    v_reason text := btrim(p_reason);
BEGIN
    IF v_reason IS NULL OR v_reason = '' THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) > 200 OR p_actor_id IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status <> 'cooking' OR v_order.payment_method <> 'transfer' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;

    -- Take the new start time after acquiring the row lock, including on a busy order.
    v_now := clock_timestamp();
    UPDATE public.orders
    SET status = 'pending',
        pending_since = v_now,
        transfer_reported_history = CASE
            WHEN transfer_reported_at IS NULL THEN transfer_reported_history
            ELSE array_append(transfer_reported_history, transfer_reported_at)
        END,
        transfer_reported_at = NULL,
        cancel_requested_at = NULL,
        cancel_rejected_at = NULL,
        paid_at = NULL,
        cooking_started_at = NULL,
        completed_at = NULL,
        closed_at = NULL,
        refund_channel = NULL
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    INSERT INTO public.order_status_history (
        order_id, from_status, to_status, action, actor_type, actor_id, reason, created_at
    ) VALUES (
        p_order_id, 'cooking', 'pending', 'revert_to_pending', 'admin', p_actor_id, v_reason, v_now
    );

    RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.revert_transfer_order_to_pending(uuid, uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_transfer_order_to_pending(uuid, uuid, text)
    TO service_role;

-- Retain T-19 auto-complete unchanged; only pending expiration checks a cycle start.
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
          -- Revert clears the previous cycle's current report under the same row lock.
          -- Any non-NULL current report was written in this cycle, even if the app clock
          -- is behind the DB clock that assigned pending_since.
          AND transfer_reported_at IS NULL
          AND COALESCE(pending_since, created_at) <= p_now - make_interval(mins => v_minutes)
        ORDER BY COALESCE(pending_since, created_at), id
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
