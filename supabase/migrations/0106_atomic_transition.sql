-- T-54: compare the cancellation snapshot under the same row lock as transition_order.
-- Allowed transitions remain defined by src/domain/order/stateMachine.ts.
BEGIN;

CREATE FUNCTION public.transition_order_if_cancel_unchanged(
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
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;

    -- NULL is a snapshot value, not an instruction to skip the comparison.
    IF v_order.cancel_requested_at IS DISTINCT FROM p_expected_cancel_requested_at
       OR v_order.cancel_rejected_at IS DISTINCT FROM p_expected_cancel_rejected_at THEN
        RAISE EXCEPTION 'STATE_CHANGED';
    END IF;

    RETURN public.transition_order(
        p_order_id, p_from, p_to, p_action,
        p_actor_type, p_actor_id, p_reason, p_refund_channel
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_if_cancel_unchanged(
    uuid, public.order_status, public.order_status, text, public.actor_type,
    uuid, text, public.refund_channel, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_if_cancel_unchanged(
    uuid, public.order_status, public.order_status, text, public.actor_type,
    uuid, text, public.refund_channel, timestamptz, timestamptz
) TO service_role;

COMMIT;
