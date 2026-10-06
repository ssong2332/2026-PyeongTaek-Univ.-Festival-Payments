"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
    menuSaveErrorMessage,
    notifyMenuAdminChanged,
    useLoginRedirect,
    useMenuAdmin,
    type MenuAdminApi,
} from "@/features/admin/useMenuAdmin";
import { ADMIN_MENU_LIMITS, type AdminMenuCreate } from "@/lib/dto/adminMenu";
import styles from "./MenuManagementPanel.module.css";

// T-37 전용 메뉴 수명주기 UI. 기존 MenuManagementPanel(T-20/T-38/T-04)은 그대로 두고
// 신규 등록과 판매 종료/재판매만 분리해 최신 편집 기능과의 충돌을 줄인다.
type NewOption = { key: string; nameKo: string; nameEn: string; extraPrice: string };
type NewGroup = { key: string; nameKo: string; nameEn: string; min: string; max: string; options: NewOption[] };

type SaveState = { saving: boolean; message: string; error: boolean };
const IDLE: SaveState = { saving: false, message: "", error: false };

function parseWhole(text: string, max: number): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value <= max ? value : null;
}

export function MenuLifecyclePanel({ api }: { api?: MenuAdminApi }) {
    const admin = useMenuAdmin(api);
    const redirectIfExpired = useLoginRedirect();
    const [creating, setCreating] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [message, setMessage] = useState("");

    async function toggleActive(id: string, isActive: boolean) {
        if (togglingId) return;
        setTogglingId(id);
        setMessage("");
        try {
            admin.replaceMenu(await admin.api.updateMenu(id, { isActive: !isActive }));
            setMessage(isActive ? "판매 종료했어요. 주문 이력은 유지돼요." : "다시 판매해요.");
            notifyMenuAdminChanged();
        } catch (error) {
            redirectIfExpired(error);
            setMessage(menuSaveErrorMessage(error));
        } finally {
            setTogglingId(null);
        }
    }

    return (
        <section className={styles.panel} aria-label="메뉴 추가·판매 상태 관리">
            <div className={styles.heading}>
                <div>
                    <h2>메뉴 추가·판매 상태</h2>
                    <p>새 메뉴를 등록하거나 메뉴판 노출을 종료·재개할 수 있어요. 판매 종료해도 기존 주문·통계는 보존됩니다.</p>
                </div>
                <div className={styles.headingActions}>
                    <button type="button" className={styles.saveButton} onClick={() => setCreating((value) => !value)} disabled={admin.status !== "ready"}>
                        <Plus size={15} /> {creating ? "추가 취소" : "메뉴 추가"}
                    </button>
                    <button type="button" className={styles.ghostButton} onClick={() => void admin.reload()} disabled={admin.status === "loading"}>
                        <RotateCcw size={15} /> 새로고침
                    </button>
                </div>
            </div>

            {admin.status === "loading" && <p role="status" className={styles.muted}>메뉴를 불러오는 중입니다…</p>}
            {admin.status === "error" && <p role="alert" className={styles.errorText}>메뉴를 불러오지 못했습니다.</p>}
            {admin.status === "unavailable" && <p role="status" className={styles.notice}>메뉴 API에 연결하지 못했어요.</p>}

            {admin.status === "ready" && creating && (
                <CreateMenuForm api={admin.api} onCreated={() => {
                    setCreating(false);
                    notifyMenuAdminChanged();
                }} />
            )}

            {admin.status === "ready" && (
                <ul className={styles.optionList}>
                    {admin.menus.map((menu) => {
                        const name = menu.translations.ko?.name ?? "이름 없음";
                        return (
                            <li key={menu.id} className={menu.isActive ? "" : styles.inactive}>
                                <div className={styles.lifecycleRow}>
                                    <div>
                                        <strong>{name}</strong>
                                        <p className={styles.muted}>{menu.isActive ? "고객 메뉴판 노출 중" : "판매 종료 · 관리자에서만 보임"}</p>
                                    </div>
                                    <button type="button" className={styles.ghostButton}
                                        disabled={togglingId !== null}
                                        onClick={() => void toggleActive(menu.id, menu.isActive)}>
                                        {togglingId === menu.id ? "저장 중…" : menu.isActive ? "판매 종료" : "다시 판매"}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {message && <p role="status" className={styles.muted}>{message}</p>}
        </section>
    );
}

function CreateMenuForm({ api, onCreated }: { api: MenuAdminApi; onCreated: () => void }) {
    const redirectIfExpired = useLoginRedirect();
    const [nameKo, setNameKo] = useState("");
    const [nameEn, setNameEn] = useState("");
    const [descriptionKo, setDescriptionKo] = useState("");
    const [descriptionEn, setDescriptionEn] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [groups, setGroups] = useState<NewGroup[]>([]);
    const [state, setState] = useState<SaveState>(IDLE);

    const addGroup = () => setGroups((current) => [...current, {
        key: crypto.randomUUID(), nameKo: "", nameEn: "", min: "0", max: "1", options: [],
    }]);
    const updateGroup = (key: string, change: (group: NewGroup) => NewGroup) =>
        setGroups((current) => current.map((group) => group.key === key ? change(group) : group));
    const addOption = (groupKey: string) => updateGroup(groupKey, (group) => ({
        ...group,
        options: [...group.options, { key: crypto.randomUUID(), nameKo: "", nameEn: "", extraPrice: "0" }],
    }));

    const basePrice = parseWhole(price, ADMIN_MENU_LIMITS.priceMax);
    const initialStock = parseWhole(stock, ADMIN_MENU_LIMITS.stockMax);
    const groupInvalid = groups.some((group) => {
        const min = parseWhole(group.min, ADMIN_MENU_LIMITS.selectMax);
        const max = parseWhole(group.max, ADMIN_MENU_LIMITS.selectMax);
        const optionCount = group.options.length;
        return !group.nameKo.trim() || !group.nameEn.trim() || min === null || max === null || max < 1 || max < min
            || min > optionCount || max > optionCount
            || group.options.some((option) => !option.nameKo.trim() || !option.nameEn.trim()
                || parseWhole(option.extraPrice, ADMIN_MENU_LIMITS.extraPriceMax) === null);
    });
    const valid = Boolean(nameKo.trim() && nameEn.trim() && basePrice !== null && initialStock !== null && !groupInvalid);

    async function create() {
        if (!valid || basePrice === null || initialStock === null || state.saving) return;
        const input: AdminMenuCreate = {
            translations: {
                ko: { name: nameKo.trim(), description: descriptionKo.trim() },
                en: { name: nameEn.trim(), description: descriptionEn.trim() },
            },
            basePrice,
            stock: initialStock,
            optionGroups: groups.map((group) => ({
                translations: { ko: { name: group.nameKo.trim() }, en: { name: group.nameEn.trim() } },
                minSelect: Number(group.min),
                maxSelect: Number(group.max),
                options: group.options.map((option) => ({
                    translations: { ko: { name: option.nameKo.trim() }, en: { name: option.nameEn.trim() } },
                    extraPrice: Number(option.extraPrice),
                })),
            })),
        };
        setState({ saving: true, message: "", error: false });
        try {
            await api.createMenu(input);
            setState({ saving: false, message: "새 메뉴를 등록했어요.", error: false });
            onCreated();
        } catch (error) {
            redirectIfExpired(error);
            setState({ saving: false, message: menuSaveErrorMessage(error), error: true });
        }
    }

    return (
        <section className={styles.createBox} aria-label="새 메뉴 등록">
            <h3>새 메뉴 등록</h3>
            <div className={styles.grid}>
                <Field label="이름(한국어)"><input value={nameKo} maxLength={ADMIN_MENU_LIMITS.nameMax} onChange={(e) => setNameKo(e.target.value)} /></Field>
                <Field label="이름(영어)"><input value={nameEn} maxLength={ADMIN_MENU_LIMITS.nameMax} onChange={(e) => setNameEn(e.target.value)} /></Field>
                <Field label="설명(한국어)"><input value={descriptionKo} maxLength={ADMIN_MENU_LIMITS.descriptionMax} onChange={(e) => setDescriptionKo(e.target.value)} /></Field>
                <Field label="설명(영어)"><input value={descriptionEn} maxLength={ADMIN_MENU_LIMITS.descriptionMax} onChange={(e) => setDescriptionEn(e.target.value)} /></Field>
                <Field label="가격(원)"><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                <Field label="초기 재고"><input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
            </div>

            <div className={styles.createGroups}>
                {groups.map((group, groupIndex) => (
                    <div className={styles.group} key={group.key}>
                        <div className={styles.groupTitle}>
                            <strong>옵션 그룹 {groupIndex + 1}</strong>
                            <button type="button" className={styles.ghostButton} onClick={() => setGroups((current) => current.filter((item) => item.key !== group.key))}>그룹 삭제</button>
                        </div>
                        <div className={styles.groupRow}>
                            <Field label="그룹명(한국어)"><input value={group.nameKo} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, nameKo: e.target.value }))} /></Field>
                            <Field label="그룹명(영어)"><input value={group.nameEn} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, nameEn: e.target.value }))} /></Field>
                            <Field label="최소"><input inputMode="numeric" value={group.min} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, min: e.target.value }))} /></Field>
                            <Field label="최대"><input inputMode="numeric" value={group.max} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, max: e.target.value }))} /></Field>
                            <button type="button" className={styles.smallSave} onClick={() => addOption(group.key)}>옵션 추가</button>
                        </div>
                        {group.options.map((option) => (
                            <div className={styles.optionRow} key={option.key}>
                                <Field label="옵션명(한국어)"><input value={option.nameKo} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, options: item.options.map((o) => o.key === option.key ? { ...o, nameKo: e.target.value } : o) }))} /></Field>
                                <Field label="옵션명(영어)"><input value={option.nameEn} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, options: item.options.map((o) => o.key === option.key ? { ...o, nameEn: e.target.value } : o) }))} /></Field>
                                <Field label="추가 가격"><input inputMode="numeric" value={option.extraPrice} onChange={(e) => updateGroup(group.key, (item) => ({ ...item, options: item.options.map((o) => o.key === option.key ? { ...o, extraPrice: e.target.value } : o) }))} /></Field>
                                <button type="button" className={styles.ghostButton} onClick={() => updateGroup(group.key, (item) => ({ ...item, options: item.options.filter((o) => o.key !== option.key) }))}>옵션 삭제</button>
                            </div>
                        ))}
                    </div>
                ))}
                <button type="button" className={styles.ghostButton} onClick={addGroup}><Plus size={15} /> 옵션 그룹 추가</button>
            </div>

            {!valid && <p className={styles.muted}>한국어·영어 이름, 가격, 초기 재고와 옵션 선택 범위를 확인해 주세요.</p>}
            {state.message && <p role={state.error ? "alert" : "status"} className={state.error ? styles.errorText : styles.successText}>{state.message}</p>}
            <button type="button" className={styles.saveButton} disabled={!valid || state.saving} onClick={() => void create()}>
                {state.saving ? "등록 중…" : "메뉴 등록"}
            </button>
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className={styles.field}><span>{label}</span>{children}</label>;
}
