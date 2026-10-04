"use client";

import { useMemo, useRef, useState } from "react";
import type { MenuItemDto } from "@/lib/dto/menu";
import {
    manualOrderShortages, manualOrderTotal, toManualOrderRequest,
    type ManualOrderLine, type ManualOrderRequest,
} from "./manualOrder";

type Props = {
    menu: MenuItemDto[];
    onSave?: (request: ManualOrderRequest) => Promise<void>;
};

function newLine(): ManualOrderLine {
    return { key: crypto.randomUUID(), menuItemId: "", quantity: 1, optionIds: [] };
}

export function ManualOrderForm({ menu, onSave }: Props) {
    const [lines, setLines] = useState<ManualOrderLine[]>(() => [newLine()]);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
    const [localKstTime, setLocalKstTime] = useState("");
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [message, setMessage] = useState("");
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
    const request = useMemo(
        () => toManualOrderRequest(lines, menu, paymentMethod, localKstTime, idempotencyKey),
        [lines, menu, paymentMethod, localKstTime, idempotencyKey],
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
            await onSave(request);
            setMessage("수기 주문이 저장되었습니다.");
            setLines([newLine()]);
            setLocalKstTime("");
            setIdempotencyKey(crypto.randomUUID());
        } catch {
            // 같은 멱등키와 입력을 유지해 재시도 시 중복 주문을 막는다.
            setMessage("저장에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.");
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    return (
        <form onSubmit={save} className="space-y-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <div>
                <h2 className="text-lg font-semibold">종이 주문 입력</h2>
                <p className="text-sm text-gray-600">종이 기록의 주문 시각은 한국 시간으로 입력하세요.</p>
            </div>
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
                                    {candidate.name} · {candidate.price.toLocaleString("ko-KR")}원
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
                                {group.options.map((option) => (
                                    <label key={option.id} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={line.optionIds.includes(option.id)}
                                            onChange={(event) => updateLine(line.key, {
                                                optionIds: event.target.checked
                                                    ? [...line.optionIds, option.id]
                                                    : line.optionIds.filter((id) => id !== option.id),
                                            })} />
                                        {option.name} (+{option.extraPrice.toLocaleString("ko-KR")}원)
                                    </label>
                                ))}
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
                현재 재고보다 많은 수량: {shortages.join(", ")}. 운영 담당자에게 재고를 확인해 주세요.
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
