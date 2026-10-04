"use client";

import { useState, type FormEvent } from "react";
import type { PaymentMethod, RefundChannel, TransitionAction } from "@/lib/dto/adminOrder";
import styles from "./OrderDashboard.module.css";

export type CancelRefundInput = { reason: string; refundChannel?: RefundChannel };
type Action = "cancel" | "refund";

export function OrderCancelRefund({ paymentMethod, availableActions, disabled, pendingAction, onAction }: {
    paymentMethod: PaymentMethod;
    availableActions: TransitionAction[];
    disabled: boolean;
    pendingAction: TransitionAction | null;
    onAction: (action: Action, input: CancelRefundInput) => void;
}) {
    const [selectedAction, setSelectedAction] = useState<Action | null>(null);
    const [reason, setReason] = useState("");
    const activeAction = selectedAction && availableActions.includes(selectedAction) ? selectedAction : null;
    const trimmedReason = reason.trim();
    const refundChannel: RefundChannel = paymentMethod === "cash" ? "cash" : "bank";

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!activeAction || disabled || trimmedReason.length < 1 || trimmedReason.length > 200) return;
        onAction(activeAction, {
            reason: trimmedReason,
            ...(activeAction === "refund" ? { refundChannel } : {}),
        });
    }

    return <section className={styles.cancelRefund} aria-label="취소 및 환불">
        <h2>취소 및 환불</h2>
        <div className={styles.cancelRefundChoices}>
            <button type="button" disabled={disabled || !availableActions.includes("cancel")}
                aria-pressed={activeAction === "cancel"}
                onClick={() => { setSelectedAction("cancel"); setReason(""); }}>주문 취소</button>
            <button type="button" disabled={disabled || !availableActions.includes("refund")}
                aria-pressed={activeAction === "refund"}
                onClick={() => { setSelectedAction("refund"); setReason(""); }}>환불 처리</button>
        </div>
        {activeAction ? <form className={styles.cancelRefundForm} onSubmit={submit}>
            <p>{activeAction === "cancel" ? "취소 시 주문 재고가 복구됩니다." :
                `환불 경로: ${refundChannel === "cash" ? "현장 현금 반환" : "고객 계좌로 역송금"} · 주문 재고가 복구됩니다.`}</p>
            <label htmlFor="cancel-refund-reason">{activeAction === "cancel" ? "취소 사유" : "환불 사유"} (필수, 최대 200자)</label>
            <textarea id="cancel-refund-reason" value={reason} maxLength={200} rows={3}
                disabled={disabled} onChange={event => setReason(event.target.value)} />
            <div className={styles.cancelRefundControls}>
                <span>{reason.length}/200자</span>
                <button type="button" disabled={disabled} onClick={() => setSelectedAction(null)}>닫기</button>
                <button type="submit" disabled={disabled || !trimmedReason || trimmedReason.length > 200}>
                    {pendingAction === activeAction ? "처리 중…" : activeAction === "cancel" ? "취소 확정" : "환불 기록"}
                </button>
            </div>
        </form> : !availableActions.includes("cancel") && !availableActions.includes("refund") &&
            <p className={styles.cancelRefundUnavailable}>이 상태에서는 취소·환불할 수 없습니다.</p>}
    </section>;
}
