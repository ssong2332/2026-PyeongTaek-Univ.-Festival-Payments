"use client";

import {
    AUTO_COMPLETE_SETTING_KEYS, PAYMENT_EXPIRE_SETTING_KEY,
    TRANSFER_SETTING_KEYS,
} from "@/lib/dto/settings";
import { useSettings, type SettingsApi } from "@/features/admin/useSettings";
import styles from "./SettingsPanel.module.css";

export type { SettingsApi } from "@/features/admin/useSettings";

const transferFields = [
    { key: TRANSFER_SETTING_KEYS.BANK_NAME, label: "은행명", id: "transfer-bank-name" },
    { key: TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER, label: "계좌번호", id: "transfer-account-number" },
    { key: TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER, label: "예금주", id: "transfer-account-holder" },
] as const;

export function SettingsPanel({ api }: { api?: SettingsApi }) {
    const { status, draft, setDraft, save, saving, fieldErrors, dirty, message, reload } = useSettings(api);
    const canSave = dirty && !saving && Object.keys(fieldErrors).length === 0;
    const transferIncomplete = transferFields.some(({ key }) => !draft[key].trim());
    const autoMinutesError = fieldErrors[AUTO_COMPLETE_SETTING_KEYS.MINUTES];
    const expireMinutesError = fieldErrors[PAYMENT_EXPIRE_SETTING_KEY];

    return <section className={styles.panel} aria-label="운영 설정">
        <div className={styles.heading}><h2>운영 설정</h2><p>계좌 정보와 주문 자동 처리 기준을 관리합니다.</p></div>
        {status === "loading" && <p role="status">설정을 불러오는 중입니다…</p>}
        {status === "error" && <div role="alert" className={styles.error}>설정을 불러오지 못했습니다. <button onClick={() => void reload()}>다시 시도</button></div>}
        {status === "ready" && <div className={styles.fields}>
            <div className={styles.groupHeading}><h3>계좌이체 안내</h3><p>변경된 계좌 정보는 고객 안내에 바로 사용됩니다.</p></div>
            {transferFields.map(({ key, label, id }) => <div className={styles.row} key={key}>
                <div><label htmlFor={id}><strong>{label}</strong></label>{!draft[key].trim() && <p className={styles.missing}>미입력</p>}</div>
                <div className={styles.inputWrap}>
                    <input id={id} className={styles.textInput} type="text" maxLength={200} value={draft[key]}
                        disabled={saving} aria-invalid={Boolean(fieldErrors[key])}
                        aria-describedby={fieldErrors[key] ? `${id}-error` : undefined}
                        onChange={event => setDraft(key, event.target.value)} />
                    {fieldErrors[key] && <p id={`${id}-error`} role="alert" className={styles.fieldError}>{fieldErrors[key]}</p>}
                </div>
            </div>)}
            {transferIncomplete && <p className={styles.warning}>계좌 정보가 미입력 상태입니다. 세 항목을 모두 입력해야 고객에게 계좌이체 안내가 표시됩니다.</p>}
            <div className={styles.groupHeading}><h3>주문 자동 처리</h3><p>설정 변경은 다음 스윕 실행부터 적용됩니다.</p></div>
            <div className={styles.row}>
                <div><strong>자동 완료</strong><p>조리중 진입 후 기준 시간이 지나면 완료로 전환합니다.</p></div>
                <label className={styles.toggle}><input type="checkbox" aria-label="자동 완료 사용"
                    checked={draft[AUTO_COMPLETE_SETTING_KEYS.ENABLED] === "true"} disabled={saving}
                    onChange={event => setDraft(AUTO_COMPLETE_SETTING_KEYS.ENABLED, String(event.target.checked))} />
                    <span>{draft[AUTO_COMPLETE_SETTING_KEYS.ENABLED] === "true" ? "켜짐" : "꺼짐"}</span></label>
            </div>
            <div className={styles.row}>
                <div><label htmlFor="auto-complete-minutes"><strong>자동 완료 기준 (분)</strong></label><p>1~120분 사이로 입력해 주세요. 기본값은 15분입니다.</p></div>
                <div className={styles.inputWrap}><input id="auto-complete-minutes" className={styles.minutes} type="number" min={1} max={120} step={1}
                    value={draft[AUTO_COMPLETE_SETTING_KEYS.MINUTES]} disabled={saving} aria-invalid={Boolean(autoMinutesError)}
                    aria-describedby={autoMinutesError ? "auto-complete-error" : undefined}
                    onChange={event => setDraft(AUTO_COMPLETE_SETTING_KEYS.MINUTES, event.target.value)} />
                    {autoMinutesError && <p id="auto-complete-error" role="alert" className={styles.fieldError}>{autoMinutesError}</p>}</div>
            </div>
            <div className={styles.row}>
                <div><label htmlFor="expire-minutes"><strong>미입금 만료 기준 (분)</strong></label><p>1~120분 사이로 입력해 주세요. 기본값은 10분입니다.</p></div>
                <div className={styles.inputWrap}><input id="expire-minutes" className={styles.minutes} type="number" min={1} max={120} step={1}
                    value={draft[PAYMENT_EXPIRE_SETTING_KEY]} disabled={saving} aria-invalid={Boolean(expireMinutesError)}
                    aria-describedby={expireMinutesError ? "expire-minutes-error" : undefined}
                    onChange={event => setDraft(PAYMENT_EXPIRE_SETTING_KEY, event.target.value)} />
                    {expireMinutesError && <p id="expire-minutes-error" role="alert" className={styles.fieldError}>{expireMinutesError}</p>}</div>
            </div>
            {message && <p role={message === "저장됐습니다." ? "status" : "alert"} className={message === "저장됐습니다." ? styles.success : styles.error}>{message}</p>}
            <div className={styles.actions}><button type="button" onClick={() => void save()} disabled={!canSave}>{saving ? "저장 중…" : "설정 저장"}</button></div>
        </div>}
    </section>;
}
