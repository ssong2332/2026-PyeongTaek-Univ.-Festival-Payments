"use client";

import { AnimatePresence, motion } from "motion/react";
import { BellRing, Megaphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./AttentionLayer.module.css";

// 새 주문·직원 호출을 소리 없이도 알아보게 하는 시각 알림.
// 도착하면 화면 위쪽이 한 번 번쩍이고, 테두리가 6번 강하게 깜빡인 뒤 알림이 남아 있는 동안 은은하게 숨 쉬고,
// 위에서 큰 알림 카드가 흔들리며 내려온다. 브라우저 탭 제목도 깜빡이고, 진동을 지원하는 폰은 진동한다.
// 주문 알림은 15초 뒤 저절로 닫히고(주문은 주문판에 남는다), 직원 호출은 [확인]을 누를 때까지 남는다.
export type AttentionKind = "order" | "staff";
export type AttentionAlert = { id: string; kind: AttentionKind; title: string; detail: string };

export const ORDER_AUTO_CLOSE_MS = 15_000;
const MAX_CARDS = 3;

export function useAttention() {
    const [alerts, setAlerts] = useState<AttentionAlert[]>([]);
    const push = useCallback((alert: AttentionAlert) => {
        setAlerts((list) => [...list.filter((item) => item.id !== alert.id), alert].slice(-MAX_CARDS));
        try {
            navigator.vibrate?.(alert.kind === "staff" ? [300, 120, 300, 120, 300] : [220, 100, 220]);
        } catch {
            // 진동이 없어도 화면 알림은 보인다.
        }
    }, []);
    const dismiss = useCallback((id: string) => setAlerts((list) => list.filter((item) => item.id !== id)), []);
    return { alerts, push, dismiss };
}

export function AttentionLayer({ alerts, onDismiss }: { alerts: readonly AttentionAlert[]; onDismiss: (id: string) => void }) {
    const latest = alerts.at(-1);
    const kind: AttentionKind = alerts.some((alert) => alert.kind === "staff") ? "staff" : "order";
    useBlinkingTitle(alerts);

    return (
        <>
            {latest && <span key={`edge-${kind}-${latest.id}`} aria-hidden="true" className={styles.edge} data-kind={kind} />}
            {latest && <span key={`flash-${latest.id}`} aria-hidden="true" className={styles.flash} data-kind={latest.kind} />}
            <div className={styles.stack} role="region" aria-label="새 알림" aria-live="assertive">
                <AnimatePresence initial={false}>
                    {alerts.map((alert) => (
                        <AttentionCard key={alert.id} alert={alert} onDismiss={() => onDismiss(alert.id)} />
                    ))}
                </AnimatePresence>
            </div>
        </>
    );
}

function AttentionCard({ alert, onDismiss }: { alert: AttentionAlert; onDismiss: () => void }) {
    const autoClose = alert.kind === "order";
    const dismissRef = useRef(onDismiss);
    useEffect(() => {
        dismissRef.current = onDismiss;
    }, [onDismiss]);
    useEffect(() => {
        if (!autoClose) return;
        const timer = window.setTimeout(() => dismissRef.current(), ORDER_AUTO_CLOSE_MS);
        return () => window.clearTimeout(timer);
    }, [autoClose]);

    const Icon = alert.kind === "staff" ? Megaphone : BellRing;
    return (
        <motion.div
            layout
            initial={{ y: -140, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: [0, -2.5, 2.5, -1.5, 1.5, 0] }}
            exit={{ y: -80, opacity: 0, scale: 0.95, transition: { duration: 0.25 } }}
            transition={{ type: "spring", stiffness: 420, damping: 22, rotate: { duration: 0.6, delay: 0.25 } }}
            className={styles.card}
            data-kind={alert.kind}
            role="alert"
        >
            <motion.span
                className={styles.icon}
                animate={{ rotate: [0, -18, 16, -12, 10, -6, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.8 }}
            >
                <Icon size={26} aria-hidden="true" />
            </motion.span>
            <span className={styles.body}>
                <p className={styles.kicker}>{alert.kind === "staff" ? "직원 호출" : "새 주문"}</p>
                <p className={styles.title}>{alert.title}</p>
                <p className={styles.detail}>{alert.detail}</p>
            </span>
            <button type="button" className={styles.ok} onClick={onDismiss}>
                확인
            </button>
            {autoClose && (
                <motion.span
                    aria-hidden="true"
                    className={styles.timer}
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: ORDER_AUTO_CLOSE_MS / 1000, ease: "linear" }}
                />
            )}
        </motion.div>
    );
}

// 다른 탭을 보고 있어도 알 수 있게 브라우저 탭 제목을 깜빡인다. 알림이 모두 닫히면 원래 제목으로 돌린다.
function useBlinkingTitle(alerts: readonly AttentionAlert[]) {
    const count = alerts.length;
    const staff = alerts.some((alert) => alert.kind === "staff");
    useEffect(() => {
        if (count === 0) return;
        const original = document.title;
        const label = staff ? `📣 직원 호출 ${count}건!` : `🔔 새 주문 ${count}건!`;
        let on = true;
        document.title = label;
        const timer = window.setInterval(() => {
            on = !on;
            document.title = on ? label : original;
        }, 900);
        return () => {
            window.clearInterval(timer);
            document.title = original;
        };
    }, [count, staff]);
}

const won = new Intl.NumberFormat("ko-KR");
const pad = (n: number) => String(n).padStart(3, "0");

// 알림 카드 문구 — 주문: "#045" / "기본 호떡 ×2 외 1 · 현금 7,000원", 직원 호출: "#044 고객"
export function orderAlert(order: {
    id: string;
    pickupNumber: number;
    paymentMethod: "cash" | "transfer";
    totalAmount: number;
    items: readonly { menuNameKo: string; quantity: number }[];
}): AttentionAlert {
    const [first, ...rest] = order.items;
    const items = first ? `${first.menuNameKo} ×${first.quantity}${rest.length ? ` 외 ${rest.length}` : ""}` : "메뉴 확인";
    const pay = order.paymentMethod === "cash" ? "현금" : "계좌이체";
    return { id: `order-${order.id}`, kind: "order", title: `#${pad(order.pickupNumber)}`, detail: `${items} · ${pay} ${won.format(order.totalAmount)}원` };
}

export function staffAlert(call: { id: string; pickupNumber: number }): AttentionAlert {
    return { id: `staff-${call.id}`, kind: "staff", title: `#${pad(call.pickupNumber)} 고객`, detail: "부스로 가서 확인해 주세요" };
}
