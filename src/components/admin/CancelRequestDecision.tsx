"use client";

import { useState, type FormEvent } from "react";
import styles from "./OrderDashboard.module.css";

export type CancelRequestDecisionKind = "approve" | "reject";

// T-35 (F-45·F-18): 고객 취소 요청의 [승인]/[거절]. 사유는 어느 쪽이든 필수(최대 200자) — 승인은 취소 처리(재고 복구),
// 거절은 요청만 해제하고 주문 상태는 그대로 둔다(POST /api/admin/orders/{id}/cancel-request).
export function CancelRequestDecision({ requestedAtLabel, disabled, onDecide }: {
    requestedAtLabel: string;
    disabled: boolean;
    onDecide: (decision: CancelRequestDecisionKind, reason: string) => Promise<void>;
}) {
    const [decision, setDecision] = useState<CancelRequestDecisionKind | null>(null);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const trimmed = reason.trim();

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!decision || disabled || submitting || trimmed.length < 1 || trimmed.length > 200) return;
        setSubmitting(true); setError("");
        try {
            await onDecide(decision, trimmed);
            setDecision(null); setReason("");
        } catch {
            setError("처리하지 못했습니다. 주문 상태를 확인하고 다시 시도해 주세요.");
        } finally {
            setSubmitting(false);
        }
    }

    return <section className={styles.cancelRefund} aria-label="고객 취소 요청">
        <h2>고객 취소 요청 · {requestedAtLabel}</h2>
        <div className={styles.cancelRefundChoices}>
            <button type="button" disabled={disabled || submitting} aria-pressed={decision === "approve"}
                onClick={() => { setDecision("approve"); setReason(""); setError(""); }}>승인</button>
            <button type="button" disabled={disabled || submitting} aria-pressed={decision === "reject"}
                onClick={() => { setDecision("reject"); setReason(""); setError(""); }}>거절</button>
        </div>
        {decision && <form className={styles.cancelRefundForm} onSubmit={submit}>
            <p>{decision === "approve" ? "승인하면 주문이 취소되고 재고가 복구됩니다." : "거절하면 요청만 해제되고 주문은 그대로 진행됩니다."}</p>
            <label htmlFor="cancel-request-reason">{decision === "approve" ? "승인 사유" : "거절 사유"} (필수, 최대 200자)</label>
            <textarea id="cancel-request-reason" value={reason} maxLength={200} rows={3}
                disabled={disabled || submitting} onChange={event => setReason(event.target.value)} />
            <div className={styles.cancelRefundControls}>
                <span>{reason.length}/200자</span>
                <button type="button" disabled={submitting} onClick={() => setDecision(null)}>닫기</button>
                <button type="submit" disabled={disabled || submitting || !trimmed}>
                    {submitting ? "처리 중…" : decision === "approve" ? "승인 확정" : "거절 확정"}
                </button>
            </div>
        </form>}
        {error && <p role="alert" className={styles.cancelRefundUnavailable}>{error}</p>}
    </section>;
}
