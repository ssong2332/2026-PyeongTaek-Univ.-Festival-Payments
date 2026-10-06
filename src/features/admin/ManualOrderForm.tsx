"use client";

import { useMemo, useRef, useState } from "react";
import {
    ManualOrderSaveError, manualOrderShortages, manualOrderTotal, toManualOrderRequest,
    type ManualOrderLine, type ManualOrderMenu, type ManualOrderRequest, type ManualOrderSaveResult,
} from "./manualOrder";

type Props = {
    menu: ManualOrderMenu[];
    onSave?: (request: ManualOrderRequest) => Promise<ManualOrderSaveResult>;
};

function newLine(): ManualOrderLine {
    return { key: crypto.randomUUID(), menuItemId: "", quantity: 1, optionIds: [] };
}

export function ManualOrderForm({ menu, onSave }: Props) {
    const [lines, setLines] = useState<ManualOrderLine[]>(() => [newLine()]);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
    const [localKstTime, setLocalKstTime] = useState("");
    const [manualNumberText, setManualNumberText] = useState("");
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [message, setMessage] = useState("");
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
    const manualNumber = /^\d+$/.test(manualNumberText) ? Number(manualNumberText) : 0;
    const request = useMemo(
        () => toManualOrderRequest(lines, menu, paymentMethod, localKstTime, idempotencyKey, manualNumber),
        [lines, menu, paymentMethod, localKstTime, idempotencyKey, manualNumber],
    );
    const shortages = manualOrderShortages(lines, menu);
    const total = manualOrderTotal(lines, menu);

    function updateLine(key: string, changes: Partial<ManualOrderLine>) {
        setLines((current) => current.map((line) =>
            line.key === key ? { ...line, ...changes } : line));
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (!request || !onSave || savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setMessage("");
        try {
            const result = await onSave(request);
            const shortageText = result.stockShortages.length > 0
                ? ` · 재고 부족 ${result.stockShortages.length}건(주문은 저장됨)`
                : "";
            setMessage(result.created
                ? `${result.displayNumber} 수기 주문이 저장되었습니다.${shortageText}`
                : `${result.displayNumber}는 같은 요청으로 이미 저장된 주문입니다.${shortageText}`);
            setLines([newLine()]);
            setLocalKstTime("");
            setManualNumberText("");
            setIdempotencyKey(crypto.randomUUID());
        } catch (error) {
            if (error instanceof ManualOrderSaveError && error.code === "MANUAL_NUMBER_TAKEN") {
                setMessage(`M-${manualNumber.toString().padStart(3, "0")} 번호는 이미 사용 중입니다. 다른 M 번호를 확인해 주세요.`);
            } else {
                setMessage("저장에 실패했습니다. 입력 내용을 유지했습니다. 확인 후 다시 시도해 주세요.");
            }
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    return (
        <form onSubmit={save} className="space-y-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <div>
                <h2 className="text-lg font-semibold">종이 주문 입력</h2>
                <p className="text-sm text-gray-600">종이에 기록된 M 번호와 주문 시각을 그대로 입력하세요.</p>
            </div>
            <label className="block text-sm font-medium">
                M 번호
                <div className="mt-1 flex items-center rounded border bg-white">
                    <span className="px-3 text-gray-600">M-</span>
                    <input aria-label="M 번호" className="min-w-0 flex-1 p-2 outline-none" inputMode="numeric"
                        pattern="[0-9]*" minLength={1} maxLength={4} value={manualNumberText} disabled={saving}
                        onChange={(event) => setManualNumberText(event.target.value.replace(/\D/g, "").slice(0, 4))} />
                </div>
                <span className="mt-1 block text-xs text-gray-500">1~9999 필수 입력</span>
            </label>
            {lines.map((line, index) => {
                const item = menu.find((candidate) => candidate.id === line.menuItemId);
                return (
                    <fieldset key={line.key} disabled={saving} className="space-y-3 rounded-lg border border-gray-200 p-4">
                        <legend className="font-medium">메뉴 {index + 1}</legend>
                        <label className="block text-sm font-medium">
                            메뉴 선택
                            <select className="mt-1 w-full rounded border p-2" value={line.menuItemId}
                                onChange={(event) => updateLine(line.key, { menuItemId: event.target.value, optionIds: [] })}>
                                <option value="">선택하세요</option>
                                {menu.map((candidate) => <option key={candidate.id} value={candidate.id}>
                                    {candidate.name} · {candidate.price.toLocaleString("ko-KR")}원{candidate.isActive === false ? " · 판매 종료(과거 메뉴)" : ""}
                                </option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-medium">
                            수량
                            <input className="mt-1 w-full rounded border p-2" type="number" min="1" max="99"
                                value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })} />
                        </label>
                        {item?.optionGroups.map((group) => (
                            <fieldset key={group.id} className="space-y-1">
                                <legend className="text-sm font-medium">{group.name} ({group.minSelect}~{group.maxSelect}개)</legend>
                                {group.options.map((option) => {
                                    const checked = line.optionIds.includes(option.id);
                                    const selectedInGroup = group.options.filter((candidate) =>
                                        line.optionIds.includes(candidate.id)).length;
                                    return <label key={option.id} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={checked}
                                            disabled={saving || (!checked && group.maxSelect !== 1 && selectedInGroup >= group.maxSelect)}
                                            onChange={(event) => {
                                                const otherGroups = line.optionIds.filter((id) =>
                                                    !group.options.some((candidate) => candidate.id === id));
                                                const currentGroup = line.optionIds.filter((id) =>
                                                    group.options.some((candidate) => candidate.id === id) && id !== option.id);
                                                updateLine(line.key, {
                                                    optionIds: event.target.checked
                                                        ? [...otherGroups, ...(group.maxSelect === 1 ? [] : currentGroup), option.id]
                                                        : [...otherGroups, ...currentGroup],
                                                });
                                            }} />
                                        {option.name} (+{option.extraPrice.toLocaleString("ko-KR")}원)
                                    </label>;
                                })}
                            </fieldset>
                        ))}
                        {lines.length > 1 && <button type="button" className="text-sm text-red-700"
                            onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}>
                            메뉴 삭제
                        </button>}
                    </fieldset>
                );
            })}
            <button type="button" disabled={saving || lines.length >= 20} className="rounded border px-3 py-2 text-sm"
                onClick={() => setLines((current) => [...current, newLine()])}>메뉴 추가</button>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                    결제수단
                    <select className="mt-1 w-full rounded border p-2" value={paymentMethod}
                        disabled={saving} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "transfer")}>
                        <option value="cash">현금</option><option value="transfer">계좌이체</option>
                    </select>
                </label>
                <label className="block text-sm font-medium">
                    종이 주문 시각 (KST)
                    <input className="mt-1 w-full rounded border p-2" type="datetime-local" value={localKstTime}
                        disabled={saving} onChange={(event) => setLocalKstTime(event.target.value)} />
                </label>
            </div>
            {shortages.length > 0 && <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-900">
                현재 재고보다 많은 수량: {shortages.join(", ")}. 저장은 가능하며 서버 응답에서 부족 수량을 다시 표시합니다.
            </p>}
            <p className="text-right font-semibold">예상 합계 {total.toLocaleString("ko-KR")}원</p>
            {!onSave && <p role="status" className="rounded bg-amber-50 p-3 text-sm text-amber-900">
                저장 API와 DB 반영이 준비 중입니다. 현재 입력은 저장되지 않습니다.
            </p>}
            {message && <p role="alert" className="text-sm">{message}</p>}
            <button type="submit" disabled={!request || !onSave || saving} className="w-full rounded bg-brand-deep p-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "저장 중…" : "수기 주문 저장"}
            </button>
        </form>
    );
}
