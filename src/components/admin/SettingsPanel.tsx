"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AdminSettingsResponseSchema, AUTO_COMPLETE_SETTING_KEYS,
    AutoCompleteEnabledSchema, AutoCompleteMinutesSchema,
} from "@/lib/dto/settings";
import styles from "./SettingsPanel.module.css";

export interface SettingsApi {
    load: () => Promise<Record<string, string>>;
    save: (changes: Record<string, string>) => Promise<Record<string, string>>;
}

const defaultApi: SettingsApi = {
    async load() {
        const response = await fetch("/api/admin/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("Settings load failed");
        return AdminSettingsResponseSchema.parse(await response.json()).settings;
    },
    async save(changes) {
        const response = await fetch("/api/admin/settings", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: changes }),
        });
        if (!response.ok) throw new Error("Settings save failed");
        return AdminSettingsResponseSchema.parse(await response.json()).settings;
    },
};

type AutoCompleteDraft = { enabled: string; minutes: string };
function toDraft(settings: Record<string, string>): AutoCompleteDraft {
    return {
        enabled: settings[AUTO_COMPLETE_SETTING_KEYS.ENABLED] ?? "false",
        minutes: settings[AUTO_COMPLETE_SETTING_KEYS.MINUTES] ?? "15",
    };
}

/** T-52가 계좌·만료 필드를 같은 패널에 확장할 수 있도록 설정 API 전체 응답을 유지한다. */
export function SettingsPanel({ api = defaultApi }: { api?: SettingsApi }) {
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [values, setValues] = useState<Record<string, string>>({});
    const [draft, setDraft] = useState<AutoCompleteDraft>({ enabled: "false", minutes: "15" });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const savingRef = useRef(false);

    const load = useCallback(async () => {
        setStatus("loading"); setMessage("");
        try {
            const result = await api.load();
            setValues(result); setDraft(toDraft(result)); setStatus("ready");
        } catch { setStatus("error"); }
    }, [api]);
    useEffect(() => {
        let active = true;
        api.load().then(result => {
            if (!active) return;
            setValues(result); setDraft(toDraft(result)); setStatus("ready");
        }).catch(() => { if (active) setStatus("error"); });
        return () => { active = false; };
    }, [api]);

    const minutesValid = AutoCompleteMinutesSchema.safeParse(draft.minutes).success;
    const enabledValid = AutoCompleteEnabledSchema.safeParse(draft.enabled).success;
    const saved = toDraft(values);
    const dirty = draft.enabled !== saved.enabled || draft.minutes !== saved.minutes;

    async function save() {
        if (savingRef.current || !dirty || !minutesValid || !enabledValid) return;
        const changes: Record<string, string> = {};
        if (draft.enabled !== saved.enabled) changes[AUTO_COMPLETE_SETTING_KEYS.ENABLED] = draft.enabled;
        if (draft.minutes !== saved.minutes) changes[AUTO_COMPLETE_SETTING_KEYS.MINUTES] = draft.minutes;
        savingRef.current = true; setSaving(true); setMessage("");
        try {
            const result = await api.save(changes);
            setValues(result); setDraft(toDraft(result)); setMessage("저장됐습니다.");
        } catch { setMessage("설정을 저장하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요."); }
        finally { savingRef.current = false; setSaving(false); }
    }

    return <section className={styles.panel} aria-label="운영 설정">
        <div className={styles.heading}><div><h2>운영 설정</h2><p>조리중 주문의 자동 완료 기준을 관리합니다.</p></div></div>
        {status === "loading" && <p role="status">설정을 불러오는 중입니다…</p>}
        {status === "error" && <div role="alert" className={styles.error}>설정을 불러오지 못했습니다. <button onClick={() => void load()}>다시 시도</button></div>}
        {status === "ready" && <div className={styles.fields}>
            <div className={styles.row}>
                <div><strong>자동 완료</strong><p>조리중 진입 후 기준 시간이 지나면 완료로 전환합니다.</p></div>
                <label className={styles.toggle}><input type="checkbox" aria-label="자동 완료 사용"
                    checked={draft.enabled === "true"} disabled={saving}
                    onChange={event => { setDraft(current => ({ ...current, enabled: String(event.target.checked) })); setMessage(""); }} />
                    <span>{draft.enabled === "true" ? "켜짐" : "꺼짐"}</span></label>
            </div>
            <div className={styles.row}>
                <div><label htmlFor="auto-complete-minutes"><strong>자동 완료 기준 (분)</strong></label><p>1~120분 사이로 입력해 주세요. 기본값은 15분입니다.</p></div>
                <input id="auto-complete-minutes" className={styles.minutes} type="number" min={1} max={120} step={1}
                    value={draft.minutes} disabled={saving} aria-invalid={!minutesValid}
                    aria-describedby={!minutesValid ? "auto-complete-error" : undefined}
                    onChange={event => { setDraft(current => ({ ...current, minutes: event.target.value })); setMessage(""); }} />
            </div>
            {!minutesValid && <p id="auto-complete-error" role="alert" className={styles.error}>자동 완료 기준은 1~120분의 정수여야 합니다.</p>}
            {message && <p role={message === "저장됐습니다." ? "status" : "alert"} className={message === "저장됐습니다." ? styles.success : styles.error}>{message}</p>}
            <div className={styles.actions}><button type="button" onClick={() => void save()}
                disabled={saving || !dirty || !minutesValid || !enabledValid}>{saving ? "저장 중…" : "설정 저장"}</button></div>
        </div>}
    </section>;
}
