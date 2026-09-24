-- T-14 transition_order. 0009 — T-53(0008, refund_channel 타입 교체)보다 반드시 뒤에 적용한다(서동혁 합의 2026-09-24).
-- 이 함수가 refund_channel을 인자로 쓰므로 먼저 있으면 T-53의 옛 타입 DROP이 실패한다. 운영 DB에는 0008 db push 뒤에 올린다.
-- 허용 전환 표는 TS(src/domain/order/stateMachine.ts)가 단일 원본이다. 이 함수는 pair를 검사하지 않고
-- CAS·터미널 불변·타임스탬프·재고 복구·이력만 강제한다(Architecture "주문 상태 머신", DECISIONS #8).
BEGIN;

CREATE FUNCTION public.transition_order(
    p_order_id uuid,
    p_from public.order_status,
    p_to public.order_status,
    p_action text,
    p_actor_type public.actor_type,
    p_actor_id uuid,
    p_reason text,
    p_refund_channel public.refund_channel
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.orders;
    v_now timestamptz := now();
BEGIN
    -- 행 잠금: 동시에 들어온 두 번째 요청은 첫 번째가 끝난 뒤 바뀐 상태를 보고 STATE_CHANGED가 된다.
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;

    IF p_from IN ('completed', 'cancelled', 'refunded', 'expired') THEN
        RAISE EXCEPTION 'TERMINAL_STATE';
    END IF;

    IF v_order.status <> p_from THEN
        RAISE EXCEPTION 'STATE_CHANGED';
    END IF;

    UPDATE public.orders
    SET status = p_to,
        -- 현금 수령 확인(pending → cooking)은 결제·조리 시작 시각을 함께 기록한다.
        paid_at = CASE
            WHEN p_to = 'paid' OR (p_from = 'pending' AND p_to = 'cooking') THEN v_now
            ELSE paid_at
        END,
        cooking_started_at = CASE WHEN p_to = 'cooking' THEN v_now ELSE cooking_started_at END,
        completed_at = CASE WHEN p_to = 'completed' THEN v_now ELSE completed_at END,
        closed_at = CASE WHEN p_to IN ('cancelled', 'refunded', 'expired') THEN v_now ELSE closed_at END,
        refund_channel = CASE WHEN p_to = 'refunded' THEN p_refund_channel ELSE refund_channel END
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    -- 재고 복구는 이 함수 한 곳에서만 한다(T-17·T-18·T-35는 이 함수를 호출).
    IF p_to IN ('cancelled', 'refunded', 'expired') THEN
        UPDATE public.menu_items AS m
        SET stock = m.stock + restored.quantity
        FROM (
            SELECT menu_item_id, sum(quantity)::integer AS quantity
            FROM public.order_items
            WHERE order_id = p_order_id
            GROUP BY menu_item_id
        ) AS restored
        WHERE m.id = restored.menu_item_id;
    END IF;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, action, actor_type, actor_id, reason)
    VALUES (p_order_id, p_from, p_to, p_action, p_actor_type, p_actor_id, p_reason);

    RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order(
    uuid, public.order_status, public.order_status, text, public.actor_type, uuid, text, public.refund_channel
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order(
    uuid, public.order_status, public.order_status, text, public.actor_type, uuid, text, public.refund_channel
) TO service_role;

COMMIT;
