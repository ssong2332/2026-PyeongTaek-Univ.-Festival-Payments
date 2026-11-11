-- T-54 / DECISIONS #71. 0106: read-then-transition cancellation race guard.
-- The existing 0009_transition_order.sql remains unchanged.
-- Apply this migration before deploying the T-54 service that calls this RPC.
-- The state machine in src/domain/order/stateMachine.ts remains the source of
-- allowed transitions; this function validates the previously observed row
-- version (status via transition_order; cancellation timestamps here).
BEGIN;

CREATE FUNCTION public.transition_order_guarded(
    p_order_id uuid,
    p_from public.order_status,
    p_to public.order_status,
    p_action text,
    p_actor_type public.actor_type,
    p_actor_id uuid,
    p_reason text,
    p_refund_channel public.refund_channel,
    p_expected_cancel_requested_at timestamptz,
    p_expected_cancel_rejected_at timestamptz
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.orders;
BEGIN
    -- Lock before comparing. If a concurrent customer cancellation UPDATE wins,
    -- this SELECT waits then observes the new cancellation timestamps. If this
    -- lock wins, the cancellation UPDATE waits and rechecks status afterwards.
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;

    -- NULL is an expected value, not "skip checking": DISTINCT FROM is
    -- NULL-safe. Reject both a newly requested and a newly rejected request.
    IF v_order.cancel_requested_at IS DISTINCT FROM p_expected_cancel_requested_at
       OR v_order.cancel_rejected_at IS DISTINCT FROM p_expected_cancel_rejected_at
    THEN
        RAISE EXCEPTION 'STATE_CHANGED';
    END IF;

    -- Reentrant row lock; executed inside the *same* RPC transaction.
    -- Reuse the original status CAS, terminal checks, timestamps, inventory
    -- restoration and status history to avoid duplicating business rules.
    RETURN public.transition_order(
        p_order_id,
        p_from,
        p_to,
        p_action,
        p_actor_type,
        p_actor_id,
        p_reason,
        p_refund_channel
    );
END;
$$;

-- New functions are PUBLIC-executable by default in Postgres.
-- REVOKE and CREATE are in one transaction: no public execution window.
REVOKE ALL ON FUNCTION public.transition_order_guarded(
    uuid, public.order_status, public.order_status, text,
    public.actor_type, uuid, text, public.refund_channel,
    timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_guarded(
    uuid, public.order_status, public.order_status, text,
    public.actor_type, uuid, text, public.refund_channel,
    timestamptz, timestamptz
) TO service_role;

COMMIT;
