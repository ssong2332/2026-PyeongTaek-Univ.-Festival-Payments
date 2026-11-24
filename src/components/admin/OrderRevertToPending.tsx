"use client";

import { useState, type FormEvent } from "react";
import type { TransitionAction } from "@/lib/dto/adminOrder";
import styles from "./OrderDashboard.module.css";

// T-55: 서버가 제공한 availableActions를 기준으로만 표시한다.
// DB 함수가 최종 상태를 다시 검사하므로, 화면의 버튼은 사전 안내 역할이다.
export function OrderRevertToPending({ availableActions, disabled, pendingAction, error, onAction }: {
    availableActions: TransitionAction[];
    disabled: boolean;
    pendingAction: TransitionAction | null;
    error?: string;
    onAction: (reason: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const trimmed = reason.trim();
    if (!availableActions.includes("revert_to_pending")) return null;

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (disabled || trimmed.length < 1 || trimmed.length > 200) return;
        onAction(trimmed);
    }

    return <section className={`${styles.cancelRefund} ${styles.revertPanel}`} aria-label="입금 확인 되돌리기">
        <h2>입금 확인 되돌리기</h2>
        <button className={styles.revertToggle} type="button" disabled={disabled} aria-expanded={open}
            onClick={() => { setOpen(value => !value); setReason(""); }}>입금 대기로 되돌리기</button>
        {open && <form className={styles.cancelRefundForm} onSubmit={submit}>
            <p>계좌이체 주문을 입금 대기로 되돌립니다. 재고는 유지되고, 이전 송금 신고는 이력에 남습니다.</p>
            <label htmlFor="revert-to-pending-reason">되돌리기 사유 (필수, 최대 200자)</label>
            <textarea id="revert-to-pending-reason" value={reason} maxLength={200} rows={3}
                disabled={disabled} onChange={event => setReason(event.target.value)} />
            <div className={styles.cancelRefundControls}>
                <span>{reason.length}/200자</span>
                <button type="button" disabled={disabled} onClick={() => setOpen(false)}>닫기</button>
                <button type="submit" disabled={disabled || !trimmed || trimmed.length > 200}>
                    {pendingAction === "revert_to_pending" ? "처리 중…" : "되돌리기 확정"}
                </button>
            </div>
        </form>}
        {error && <p role="alert" className={styles.cancelRefundUnavailable}>{error}</p>}
    </section>;
}
