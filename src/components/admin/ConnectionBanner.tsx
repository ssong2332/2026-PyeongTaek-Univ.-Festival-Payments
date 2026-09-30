"use client";

import { WifiOff } from "lucide-react";
import styles from "./ConnectionBanner.module.css";

export interface ConnectionBannerProps {
    disconnected: boolean;
    onRetry: () => Promise<void>;
    retrying?: boolean;
}

/** 연결 감시 훅이 10초 이상 끊김을 확정한 경우에만 표시한다. */
export function ConnectionBanner({ disconnected, onRetry, retrying = false }: ConnectionBannerProps) {
    if (!disconnected) return null;

    return <div className={styles.banner} role="alert" aria-live="assertive">
        <WifiOff aria-hidden="true" size={22} />
        <div className={styles.message}>
            <strong>서버 연결이 끊겼습니다</strong>
            <span>연결이 복구되면 누락된 주문을 자동으로 다시 불러옵니다.</span>
        </div>
        <button type="button" onClick={() => void onRetry()} disabled={retrying}>
            {retrying ? "확인 중…" : "다시 확인"}
        </button>
    </div>;
}
