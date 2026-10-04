"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AdminSettingsResponseSchema, ADMIN_SETTING_KEYS, AUTO_COMPLETE_SETTING_KEYS,
    AutoCompleteEnabledSchema, MinutesSettingSchema,
    PAYMENT_EXPIRE_SETTING_KEY, PaymentExpireMinutesSchema, TransferSettingSchema,
} from "@/lib/dto/settings";

export interface SettingsApi {
    load: () => Promise<Record<string, string>>;
    save: (changes: Record<string, string>) => Promise<Record<string, string>>;
}

export const settingsApi: SettingsApi = {
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

export type SettingKey = typeof ADMIN_SETTING_KEYS[number];
export type SettingsDraft = Record<SettingKey, string>;

const defaults: SettingsDraft = {
    "transfer.bank_name": "",
    "transfer.account_number": "",
    "transfer.account_holder": "",
    "auto_complete.enabled": "false",
    "auto_complete.minutes": "15",
    "payment.expire_minutes": "10",
};

function toDraft(settings: Record<string, string>): SettingsDraft {
    return Object.fromEntries(ADMIN_SETTING_KEYS.map(key => [key, settings[key] ?? defaults[key]])) as SettingsDraft;
}

function validate(draft: SettingsDraft): Partial<Record<SettingKey, string>> {
    const errors: Partial<Record<SettingKey, string>> = {};
    for (const key of ADMIN_SETTING_KEYS) {
        const value = draft[key];
        if (key === AUTO_COMPLETE_SETTING_KEYS.ENABLED) {
            if (!AutoCompleteEnabledSchema.safeParse(value).success) errors[key] = "자동 완료 설정값이 올바르지 않습니다.";
        } else if (key === AUTO_COMPLETE_SETTING_KEYS.MINUTES) {
            if (!MinutesSettingSchema.safeParse(value).success) errors[key] = "자동 완료 기준은 1~120분의 정수여야 합니다.";
        } else if (key === PAYMENT_EXPIRE_SETTING_KEY) {
            if (!PaymentExpireMinutesSchema.safeParse(value).success) errors[key] = "미입금 만료 기준은 1~120분의 정수여야 합니다.";
        } else if (!TransferSettingSchema.safeParse(value).success) {
            errors[key] = "200자 이하로 입력해 주세요.";
        }
    }
    return errors;
}

export function useSettings(api: SettingsApi = settingsApi) {
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [values, setValues] = useState<Record<string, string>>({});
    const [draft, setDraftState] = useState<SettingsDraft>(defaults);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const savingRef = useRef(false);

    const reload = useCallback(async () => {
        setStatus("loading"); setMessage("");
        try {
            const result = await api.load();
            setValues(result); setDraftState(toDraft(result)); setStatus("ready");
        } catch { setStatus("error"); }
    }, [api]);

    useEffect(() => {
        let active = true;
        api.load().then(result => {
            if (!active) return;
            setValues(result); setDraftState(toDraft(result)); setStatus("ready");
        }).catch(() => { if (active) setStatus("error"); });
        return () => { active = false; };
    }, [api]);

    const fieldErrors = validate(draft);
    const saved = toDraft(values);
    const dirty = ADMIN_SETTING_KEYS.some(key => draft[key] !== saved[key]);

    function setDraft(key: SettingKey, value: string) {
        setDraftState(current => ({ ...current, [key]: value }));
        setMessage("");
    }

    async function save() {
        if (savingRef.current || !dirty || Object.keys(fieldErrors).length) return;
        const changes = Object.fromEntries(ADMIN_SETTING_KEYS
            .filter(key => draft[key] !== saved[key])
            .map(key => [key, draft[key]]));
        savingRef.current = true; setSaving(true); setMessage("");
        try {
            const result = await api.save(changes);
            setValues(result); setDraftState(toDraft(result)); setMessage("저장됐습니다.");
        } catch { setMessage("설정을 저장하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요."); }
        finally { savingRef.current = false; setSaving(false); }
    }

    return { status, values, draft, setDraft, save, saving, fieldErrors, dirty, message, reload };
}
