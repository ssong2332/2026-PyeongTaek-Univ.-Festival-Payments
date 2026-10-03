"use client";

import { useRef, useState } from "react";
import styles from "./RecommendedMenuToggle.module.css";

export interface RecommendedMenuToggleProps {
    menu: { id: string; name: string; isRecommended: boolean };
    onSave: (menuId: string, isRecommended: boolean) => Promise<void>;
    disabled?: boolean;
}

/** T-20's menu editor supplies the saved value and persists changes through its API. */
export function RecommendedMenuToggle({ menu, onSave, disabled = false }: RecommendedMenuToggleProps) {
    const inFlight = useRef(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function toggle() {
        if (disabled || inFlight.current) return;
        inFlight.current = true;
        setSaving(true);
        setError("");
        try {
            await onSave(menu.id, !menu.isRecommended);
        } catch {
            setError("추천 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
        } finally {
            inFlight.current = false;
            setSaving(false);
        }
    }

    return <div className={styles.control}>
        <span className={styles.name}>{menu.name}</span>
        <button type="button" role="switch" aria-label={`${menu.name} 추천 메뉴`}
            aria-checked={menu.isRecommended} aria-busy={saving}
            disabled={disabled || saving} onClick={toggle}>
            {saving ? "저장 중…" : menu.isRecommended ? "추천 ON" : "추천 OFF"}
        </button>
        {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>;
}
