"use client";

import { Minus, PackageX, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { MenuThumbnail } from "@/components/customer/MenuThumbnail";
import { menuImageUrl } from "@/features/customer/menuImages";
import { menuSaveErrorMessage, useLoginRedirect, useMenuAdmin, type MenuAdminApi } from "@/features/admin/useMenuAdmin";
import {
    ADMIN_MENU_LIMITS,
    type AdminMenuDto,
    type AdminMenuOptionDto,
    type AdminMenuOptionGroupDto,
    type AdminMenuPatch,
    type AdminOptionGroupPatch,
    type AdminOptionPatch,
} from "@/lib/dto/adminMenu";
import styles from "./MenuManagementPanel.module.css";

export type { MenuAdminApi } from "@/features/admin/useMenuAdmin";

// T-20 메뉴·재고 관리 화면(1차 = 수정만, F-25·F-26·F-27). 메뉴 추가·삭제 버튼은 없다(2차 T-37).
// 저장은 Architecture 7절의 관리자 메뉴 API(PATCH /api/admin/menus·option-groups·options)를 부른다.
// 축제 당일 가장 자주 쓰는 "품절 처리"와 옵션 "판매 중지"는 누르는 즉시 저장하고,
// 이름·가격·재고는 고친 뒤 [저장]으로 한 번에 보낸다. 재고가 0이면 따로 누르지 않아도 고객 메뉴판에서 품절로 보인다.

type SaveState = { saving: boolean; message: string; error: boolean };
const IDLE: SaveState = { saving: false, message: "", error: false };

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

function parseWhole(text: string, max: number): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value <= max ? value : null;
}

// 저장 응답 등으로 원본이 바뀌면, 사용자가 고치지 않은 칸만 새 값으로 바꾸고 고치던 칸은 그대로 둔다
// (예: 가격을 고치던 중 품절 토글을 눌러도 입력한 가격이 사라지지 않음).
function rebase<T extends Record<string, string>>(draft: T, before: T, after: T): T {
    const next = { ...draft };
    for (const key of Object.keys(after) as (keyof T)[]) {
        if (draft[key] === before[key]) next[key] = after[key];
    }
    return next;
}

// 저장 한 번의 진행·결과 문구를 다루는 작은 도구(카드·그룹·옵션이 각자 쓴다)
function useSaver(onUpdated: (menu: AdminMenuDto) => void) {
    const redirectIfExpired = useLoginRedirect();
    const [state, setState] = useState<SaveState>(IDLE);
    const run = async (action: () => Promise<AdminMenuDto>, success: string) => {
        setState({ saving: true, message: "", error: false });
        try {
            onUpdated(await action());
            setState({ saving: false, message: success, error: false });
            return true;
        } catch (error) {
            redirectIfExpired(error);
            setState({ saving: false, message: menuSaveErrorMessage(error), error: true });
            return false;
        }
    };
    return { state, run };
}

function SaveMessage({ state }: { state: SaveState }) {
    if (!state.message) return null;
    return (
        <p role={state.error ? "alert" : "status"} className={state.error ? styles.errorText : styles.successText}>
            {state.message}
        </p>
    );
}

function stockStatus(menu: AdminMenuDto): { label: string; tone: "ok" | "out" | "off" } {
    if (!menu.isActive) return { label: "판매 종료(메뉴판 미노출)", tone: "off" };
    if (menu.isSoldOutManual) return { label: "품절(수동)", tone: "out" };
    if (menu.stock <= 0) return { label: "품절(재고 0)", tone: "out" };
    return { label: `판매중 · 재고 ${menu.stock}`, tone: "ok" };
}

export function MenuManagementPanel({ api }: { api?: MenuAdminApi }) {
    const admin = useMenuAdmin(api);
    const soldOut = admin.menus.filter((menu) => menu.isActive && (menu.isSoldOutManual || menu.stock <= 0)).length;

    return (
        <section className={styles.panel} aria-label="메뉴·재고 관리">
            <div className={styles.heading}>
                <div>
                    <h2>메뉴·재고 관리</h2>
                    <p>품절 처리·옵션 판매 중지는 누르는 즉시 고객 메뉴판에 반영돼요. 재고가 0이 되면 자동으로 품절돼요.</p>
                </div>
                <button type="button" className={styles.ghostButton} onClick={() => void admin.reload()} disabled={admin.status === "loading"}>
                    <RotateCcw size={15} /> 새로고침
                </button>
            </div>
            {admin.status === "loading" && <p role="status" className={styles.muted}>메뉴를 불러오는 중입니다…</p>}
            {admin.status === "error" && (
                <div role="alert" className={styles.errorBox}>
                    메뉴를 불러오지 못했습니다. <button type="button" onClick={() => void admin.reload()}>다시 시도</button>
                </div>
            )}
            {admin.status === "unavailable" && (
                <div role="status" className={styles.notice}>
                    메뉴 수정 기능(서버 API)에 연결하지 못했어요. 최신 버전이 배포됐는지 확인해 주세요.
                </div>
            )}
            {admin.status === "ready" && admin.menus.length === 0 && (
                <p className={styles.muted}>메뉴가 없습니다 — 시드 데이터를 확인하세요.</p>
            )}
            {admin.status === "ready" && admin.menus.length > 0 && (
                <>
                    <p className={styles.summary}>
                        메뉴 {admin.menus.length}개 · 지금 품절 <strong>{soldOut}</strong>개
                    </p>
                    <ul className={styles.list}>
                        {admin.menus.map((menu) => (
                            <li key={menu.id}>
                                <MenuEditCard menu={menu} api={admin.api} onUpdated={admin.replaceMenu} />
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

type MenuDraft = { nameKo: string; nameEn: string; descriptionKo: string; price: string; stock: string };

function toMenuDraft(menu: AdminMenuDto): MenuDraft {
    return {
        nameKo: menu.translations.ko?.name ?? "",
        nameEn: menu.translations.en?.name ?? "",
        descriptionKo: menu.translations.ko?.description ?? "",
        price: String(menu.basePrice),
        stock: String(menu.stock),
    };
}

function validateMenuDraft(draft: MenuDraft, menu: AdminMenuDto): Partial<Record<keyof MenuDraft, string>> {
    const errors: Partial<Record<keyof MenuDraft, string>> = {};
    if (!draft.nameKo.trim()) errors.nameKo = "한국어 이름을 입력해 주세요.";
    else if (draft.nameKo.trim().length > ADMIN_MENU_LIMITS.nameMax) errors.nameKo = `${ADMIN_MENU_LIMITS.nameMax}자 이하로 입력해 주세요.`;
    // 영어 이름은 원래 있던 메뉴에서 지우는 것만 막는다(없던 메뉴는 비워 두면 한국어로 보인다).
    if (!draft.nameEn.trim() && menu.translations.en) errors.nameEn = "영어 이름을 입력해 주세요.";
    else if (draft.nameEn.trim().length > ADMIN_MENU_LIMITS.nameMax) errors.nameEn = `${ADMIN_MENU_LIMITS.nameMax}자 이하로 입력해 주세요.`;
    if (draft.descriptionKo.trim().length > ADMIN_MENU_LIMITS.descriptionMax) errors.descriptionKo = `${ADMIN_MENU_LIMITS.descriptionMax}자 이하로 입력해 주세요.`;
    if (parseWhole(draft.price, ADMIN_MENU_LIMITS.priceMax) === null) errors.price = "가격은 0 이상의 정수(원)로 입력해 주세요.";
    if (parseWhole(draft.stock, ADMIN_MENU_LIMITS.stockMax) === null) errors.stock = "재고는 0 이상의 정수로 입력해 주세요.";
    return errors;
}

// 바뀐 칸만 담는다. 이름·설명은 언어별로 묶어 보낸다(ko는 이름이 늘 함께 가야 한다).
function menuPatch(draft: MenuDraft, menu: AdminMenuDto): AdminMenuPatch {
    const patch: AdminMenuPatch = {};
    const price = parseWhole(draft.price, ADMIN_MENU_LIMITS.priceMax);
    const stock = parseWhole(draft.stock, ADMIN_MENU_LIMITS.stockMax);
    if (price !== null && price !== menu.basePrice) patch.basePrice = price;
    if (stock !== null && stock !== menu.stock) patch.stock = stock;
    const translations: NonNullable<AdminMenuPatch["translations"]> = {};
    const ko = menu.translations.ko;
    if (draft.nameKo.trim() !== (ko?.name ?? "") || draft.descriptionKo.trim() !== (ko?.description ?? "")) {
        translations.ko = { name: draft.nameKo.trim(), description: draft.descriptionKo.trim() };
    }
    if (draft.nameEn.trim() && draft.nameEn.trim() !== (menu.translations.en?.name ?? "")) translations.en = { name: draft.nameEn.trim() };
    if (Object.keys(translations).length > 0) patch.translations = translations;
    return patch;
}

function MenuEditCard({ menu, api, onUpdated }: { menu: AdminMenuDto; api: MenuAdminApi; onUpdated: (menu: AdminMenuDto) => void }) {
    const [base, setBase] = useState(menu);
    const [draft, setDraftState] = useState(() => toMenuDraft(menu));
    // 저장 응답 등으로 메뉴가 바뀌면 입력칸을 새 값에 맞춘다(렌더 중 상태 조정, 고치던 칸은 유지).
    if (base !== menu) {
        setBase(menu);
        setDraftState(rebase(draft, toMenuDraft(base), toMenuDraft(menu)));
    }
    const fields = useSaver(onUpdated);
    const soldOutToggle = useSaver(onUpdated);
    const errors = validateMenuDraft(draft, menu);
    const patch = menuPatch(draft, menu);
    const dirty = Object.keys(patch).length > 0;
    const canSave = dirty && Object.keys(errors).length === 0 && !fields.state.saving;
    const status = stockStatus(menu);
    const id = (field: string) => `menu-${menu.id}-${field}`;
    const nameKo = menu.translations.ko?.name ?? "이름 없음";
    const setDraft = (field: keyof MenuDraft, value: string) => setDraftState((previous) => ({ ...previous, [field]: value }));
    const bumpStock = (delta: number) => {
        const current = parseWhole(draft.stock, ADMIN_MENU_LIMITS.stockMax) ?? menu.stock;
        setDraft("stock", String(Math.min(ADMIN_MENU_LIMITS.stockMax, Math.max(0, current + delta))));
    };
    const busy = fields.state.saving || soldOutToggle.state.saving;

    return (
        <article className={`${styles.card} ${menu.isActive ? "" : styles.inactive}`} aria-labelledby={id("title")}>
            <header className={styles.cardHead}>
                <MenuThumbnail imageUrl={menuImageUrl(menu.id, menu.imageUrl)} className={styles.thumb} />
                <div className={styles.cardTitle}>
                    <h3 id={id("title")}>{nameKo}</h3>
                    <span className={styles.badge} data-tone={status.tone}>{status.label}</span>
                </div>
                <label className={styles.soldOut} data-on={menu.isSoldOutManual || undefined}>
                    <input
                        type="checkbox"
                        role="switch"
                        aria-label={`${nameKo} 품절 처리`}
                        checked={menu.isSoldOutManual}
                        disabled={busy}
                        onChange={(event) => {
                            const next = event.target.checked;
                            void soldOutToggle.run(() => api.updateMenu(menu.id, { isSoldOutManual: next }), next ? "품절로 바꿨어요." : "다시 판매해요.");
                        }}
                    />
                    <PackageX size={16} aria-hidden="true" />
                    <span>{menu.isSoldOutManual ? "품절 중" : "품절 처리"}</span>
                </label>
            </header>
            <SaveMessage state={soldOutToggle.state} />

            <div className={styles.grid}>
                <Field id={id("name-ko")} label="이름(한국어)" error={errors.nameKo}>
                    <input id={id("name-ko")} value={draft.nameKo} maxLength={ADMIN_MENU_LIMITS.nameMax} disabled={busy}
                        aria-invalid={Boolean(errors.nameKo)} aria-describedby={errors.nameKo ? `${id("name-ko")}-error` : undefined}
                        onChange={(event) => setDraft("nameKo", event.target.value)} />
                </Field>
                <Field id={id("name-en")} label="이름(영어)" error={errors.nameEn}>
                    <input id={id("name-en")} value={draft.nameEn} maxLength={ADMIN_MENU_LIMITS.nameMax} disabled={busy}
                        aria-invalid={Boolean(errors.nameEn)} aria-describedby={errors.nameEn ? `${id("name-en")}-error` : undefined}
                        onChange={(event) => setDraft("nameEn", event.target.value)} />
                </Field>
                <Field id={id("description-ko")} label="설명(한국어)" error={errors.descriptionKo} wide>
                    <input id={id("description-ko")} value={draft.descriptionKo} maxLength={ADMIN_MENU_LIMITS.descriptionMax} disabled={busy}
                        aria-invalid={Boolean(errors.descriptionKo)} aria-describedby={errors.descriptionKo ? `${id("description-ko")}-error` : undefined}
                        onChange={(event) => setDraft("descriptionKo", event.target.value)} />
                </Field>
                <Field id={id("price")} label="가격(원)" error={errors.price}>
                    <input id={id("price")} inputMode="numeric" value={draft.price} disabled={busy}
                        aria-invalid={Boolean(errors.price)} aria-describedby={errors.price ? `${id("price")}-error` : undefined}
                        onChange={(event) => setDraft("price", event.target.value)} />
                </Field>
                <Field id={id("stock")} label="재고" error={errors.stock}>
                    <div className={styles.stepper}>
                        <button type="button" aria-label={`${nameKo} 재고 1 줄이기`} disabled={busy} onClick={() => bumpStock(-1)}><Minus size={16} /></button>
                        <input id={id("stock")} inputMode="numeric" value={draft.stock} disabled={busy}
                            aria-invalid={Boolean(errors.stock)} aria-describedby={errors.stock ? `${id("stock")}-error` : undefined}
                            onChange={(event) => setDraft("stock", event.target.value)} />
                        <button type="button" aria-label={`${nameKo} 재고 1 늘리기`} disabled={busy} onClick={() => bumpStock(1)}><Plus size={16} /></button>
                        <button type="button" aria-label={`${nameKo} 재고 10 늘리기`} disabled={busy} onClick={() => bumpStock(10)} className={styles.plusTen}>+10</button>
                    </div>
                </Field>
            </div>

            <div className={styles.cardActions}>
                <SaveMessage state={fields.state} />
                {dirty && (
                    <button type="button" className={styles.ghostButton} disabled={fields.state.saving} onClick={() => setDraftState(toMenuDraft(menu))}>
                        되돌리기
                    </button>
                )}
                <button type="button" className={styles.saveButton} disabled={!canSave}
                    onClick={() => void fields.run(() => api.updateMenu(menu.id, patch), "저장했어요.")}>
                    {fields.state.saving ? "저장 중…" : "메뉴 저장"}
                </button>
            </div>

            {menu.optionGroups.length > 0 && (
                <details className={styles.options}>
                    <summary>
                        옵션 {menu.optionGroups.length}그룹 · {menu.optionGroups.reduce((sum, group) => sum + group.options.length, 0)}개
                    </summary>
                    {menu.optionGroups.map((group) => (
                        <OptionGroupEditor key={group.id} group={group} api={api} onUpdated={onUpdated} />
                    ))}
                </details>
            )}
        </article>
    );
}

function Field({ id, label, error, wide, children }: { id: string; label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
    return (
        <div className={`${styles.field} ${wide ? styles.wide : ""}`}>
            <label htmlFor={id}>{label}</label>
            {children}
            {error && <p id={`${id}-error`} role="alert" className={styles.errorText}>{error}</p>}
        </div>
    );
}

type GroupDraft = { nameKo: string; nameEn: string; min: string; max: string };

function toGroupDraft(group: AdminMenuOptionGroupDto): GroupDraft {
    return { nameKo: group.translations.ko?.name ?? "", nameEn: group.translations.en?.name ?? "", min: String(group.minSelect), max: String(group.maxSelect) };
}

function OptionGroupEditor({ group, api, onUpdated }: { group: AdminMenuOptionGroupDto; api: MenuAdminApi; onUpdated: (menu: AdminMenuDto) => void }) {
    const [base, setBase] = useState(group);
    const [draft, setDraftState] = useState(() => toGroupDraft(group));
    if (base !== group) {
        setBase(group);
        setDraftState(rebase(draft, toGroupDraft(base), toGroupDraft(group)));
    }
    const saver = useSaver(onUpdated);
    const id = (field: string) => `group-${group.id}-${field}`;
    const min = parseWhole(draft.min, ADMIN_MENU_LIMITS.selectMax);
    const max = parseWhole(draft.max, ADMIN_MENU_LIMITS.selectMax);
    let error = "";
    if (!draft.nameKo.trim()) error = "그룹 이름(한국어)을 입력해 주세요.";
    else if (!draft.nameEn.trim() && group.translations.en) error = "그룹 이름(영어)을 입력해 주세요.";
    else if (min === null || max === null || max < 1) error = "선택 수는 0~20 사이 정수, 최대는 1 이상이에요.";
    else if (max < min) error = "최대 선택 수는 최소 선택 수보다 작을 수 없어요.";

    const patch: AdminOptionGroupPatch = {};
    if (min !== null && min !== group.minSelect) patch.minSelect = min;
    if (max !== null && max !== group.maxSelect) patch.maxSelect = max;
    const translations: NonNullable<AdminOptionGroupPatch["translations"]> = {};
    if (draft.nameKo.trim() && draft.nameKo.trim() !== (group.translations.ko?.name ?? "")) translations.ko = { name: draft.nameKo.trim() };
    if (draft.nameEn.trim() && draft.nameEn.trim() !== (group.translations.en?.name ?? "")) translations.en = { name: draft.nameEn.trim() };
    if (Object.keys(translations).length > 0) patch.translations = translations;
    const dirty = Object.keys(patch).length > 0;
    const setDraft = (field: keyof GroupDraft, value: string) => setDraftState((previous) => ({ ...previous, [field]: value }));

    return (
        <div className={styles.group}>
            <div className={styles.groupRow}>
                <div className={styles.field}>
                    <label htmlFor={id("name-ko")}>그룹 이름(한국어)</label>
                    <input id={id("name-ko")} value={draft.nameKo} maxLength={ADMIN_MENU_LIMITS.nameMax} disabled={saver.state.saving} onChange={(event) => setDraft("nameKo", event.target.value)} />
                </div>
                <div className={styles.field}>
                    <label htmlFor={id("name-en")}>그룹 이름(영어)</label>
                    <input id={id("name-en")} value={draft.nameEn} maxLength={ADMIN_MENU_LIMITS.nameMax} disabled={saver.state.saving} onChange={(event) => setDraft("nameEn", event.target.value)} />
                </div>
                <div className={`${styles.field} ${styles.narrow}`}>
                    <label htmlFor={id("min")}>최소 선택</label>
                    <input id={id("min")} inputMode="numeric" value={draft.min} disabled={saver.state.saving} onChange={(event) => setDraft("min", event.target.value)} />
                </div>
                <div className={`${styles.field} ${styles.narrow}`}>
                    <label htmlFor={id("max")}>최대 선택</label>
                    <input id={id("max")} inputMode="numeric" value={draft.max} disabled={saver.state.saving} onChange={(event) => setDraft("max", event.target.value)} />
                </div>
                <button type="button" className={styles.smallSave} disabled={!dirty || Boolean(error) || saver.state.saving}
                    onClick={() => void saver.run(() => api.updateOptionGroup(group.id, patch), "그룹을 저장했어요.")}>
                    {saver.state.saving ? "저장 중…" : "그룹 저장"}
                </button>
            </div>
            {dirty && error && <p role="alert" className={styles.errorText}>{error}</p>}
            <SaveMessage state={saver.state} />
            <ul className={styles.optionList}>
                {group.options.map((option) => (
                    <li key={option.id}>
                        <OptionRow option={option} api={api} onUpdated={onUpdated} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

type OptionDraft = { nameKo: string; nameEn: string; price: string };

function toOptionDraft(option: AdminMenuOptionDto): OptionDraft {
    return { nameKo: option.translations.ko?.name ?? "", nameEn: option.translations.en?.name ?? "", price: String(option.extraPrice) };
}

function OptionRow({ option, api, onUpdated }: { option: AdminMenuOptionDto; api: MenuAdminApi; onUpdated: (menu: AdminMenuDto) => void }) {
    const [base, setBase] = useState(option);
    const [draft, setDraftState] = useState(() => toOptionDraft(option));
    if (base !== option) {
        setBase(option);
        setDraftState(rebase(draft, toOptionDraft(base), toOptionDraft(option)));
    }
    const fields = useSaver(onUpdated);
    const toggle = useSaver(onUpdated);
    const id = (field: string) => `option-${option.id}-${field}`;
    const price = parseWhole(draft.price, ADMIN_MENU_LIMITS.extraPriceMax);
    let error = "";
    if (!draft.nameKo.trim()) error = "옵션 이름(한국어)을 입력해 주세요.";
    else if (!draft.nameEn.trim() && option.translations.en) error = "옵션 이름(영어)을 입력해 주세요.";
    else if (price === null) error = "추가 가격은 0 이상의 정수(원)로 입력해 주세요.";

    const patch: AdminOptionPatch = {};
    if (price !== null && price !== option.extraPrice) patch.extraPrice = price;
    const translations: NonNullable<AdminOptionPatch["translations"]> = {};
    if (draft.nameKo.trim() && draft.nameKo.trim() !== (option.translations.ko?.name ?? "")) translations.ko = { name: draft.nameKo.trim() };
    if (draft.nameEn.trim() && draft.nameEn.trim() !== (option.translations.en?.name ?? "")) translations.en = { name: draft.nameEn.trim() };
    if (Object.keys(translations).length > 0) patch.translations = translations;
    const dirty = Object.keys(patch).length > 0;
    const busy = fields.state.saving || toggle.state.saving;
    const label = option.translations.ko?.name ?? "옵션";
    const setDraft = (field: keyof OptionDraft, value: string) => setDraftState((previous) => ({ ...previous, [field]: value }));

    return (
        <div className={`${styles.optionRow} ${option.isActive ? "" : styles.inactive}`}>
            <div className={styles.field}>
                <label htmlFor={id("name-ko")}>옵션(한국어)</label>
                <input id={id("name-ko")} value={draft.nameKo} maxLength={ADMIN_MENU_LIMITS.nameMax} disabled={busy} onChange={(event) => setDraft("nameKo", event.target.value)} />
            </div>
            <div className={styles.field}>
                <label htmlFor={id("name-en")}>옵션(영어)</label>
                <input id={id("name-en")} value={draft.nameEn} maxLength={ADMIN_MENU_LIMITS.nameMax} disabled={busy} onChange={(event) => setDraft("nameEn", event.target.value)} />
            </div>
            <div className={`${styles.field} ${styles.narrow}`}>
                <label htmlFor={id("price")}>추가 가격</label>
                <input id={id("price")} inputMode="numeric" value={draft.price} disabled={busy} onChange={(event) => setDraft("price", event.target.value)} />
            </div>
            <label className={styles.optionToggle}>
                <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${label} 판매`}
                    checked={option.isActive}
                    disabled={busy}
                    onChange={(event) => {
                        const next = event.target.checked;
                        void toggle.run(() => api.updateOption(option.id, { isActive: next }), next ? `${label} 다시 판매해요.` : `${label} 판매를 멈췄어요.`);
                    }}
                />
                <span>{option.isActive ? `판매중 · +${won(option.extraPrice)}` : "판매 중지"}</span>
            </label>
            <button type="button" className={styles.smallSave} disabled={!dirty || Boolean(error) || busy} aria-label={`${label} 옵션 저장`}
                onClick={() => void fields.run(() => api.updateOption(option.id, patch), "옵션을 저장했어요.")}>
                {fields.state.saving ? "저장 중…" : "저장"}
            </button>
            {dirty && error && <p role="alert" className={`${styles.errorText} ${styles.rowMessage}`}>{error}</p>}
            <div className={styles.rowMessage}>
                <SaveMessage state={fields.state} />
                <SaveMessage state={toggle.state} />
            </div>
        </div>
    );
}
