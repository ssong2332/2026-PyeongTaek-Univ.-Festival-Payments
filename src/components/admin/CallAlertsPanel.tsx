"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import styles from "./CallAlertsPanel.module.css";

export interface StaffCallAlert {
    id: string;
    pickupNumber: number;
    createdAt: string;
    acknowledgedAt: string | null;
}

export interface CallAlertsPanelProps {
    alerts: StaffCallAlert[];
    onAcknowledge: (id: string) => Promise<void>;
}

export function CallAlertsPanel({ alerts, onAcknowledge }: CallAlertsPanelProps) {
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
    const [errorId, setErrorId] = useState<string | null>(null);
    const active = alerts.filter(alert => alert.acknowledgedAt === null && !confirmedIds.includes(alert.id));

    async function acknowledge(id: string) {
        if (pendingId !== null) return;
        setPendingId(id);
        setErrorId(null);
        try {
            await onAcknowledge(id);
            setConfirmedIds(previous => [...previous, id]);
        } catch {
            setErrorId(id);
        } finally {
            setPendingId(null);
        }
    }

    return <section className={styles.panel} aria-labelledby="staff-call-heading">
        <div className={styles.heading}>
            <BellRing aria-hidden="true" size={20} />
            <h2 id="staff-call-heading">직원 호출</h2>
            <span className={styles.count} aria-label={`확인 대기 ${active.length}건`}>{active.length}건</span>
        </div>
        {active.length === 0 ? <p className={styles.empty}>확인할 직원 호출이 없습니다.</p> :
            <ul className={styles.list}>{active.map(alert => <li key={alert.id} className={styles.item}>
                <div>
                    <strong>픽업 #{String(alert.pickupNumber).padStart(3, "0")}</strong>
                    <time dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 호출</time>
                    {errorId === alert.id && <p className={styles.error} role="alert">확인 처리에 실패했습니다. 다시 시도해 주세요.</p>}
                </div>
                <button type="button" onClick={() => void acknowledge(alert.id)} disabled={pendingId !== null}
                    aria-label={`픽업 ${String(alert.pickupNumber).padStart(3, "0")} 직원 호출 확인`}>
                    {pendingId === alert.id ? "처리 중…" : "확인 해제"}
                </button>
            </li>)}</ul>}
    </section>;
}
