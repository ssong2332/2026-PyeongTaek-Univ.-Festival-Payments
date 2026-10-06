"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMenuAdmin } from "@/features/admin/useMenuAdmin";
import { ManualOrderForm } from "@/features/admin/ManualOrderForm";
import {
    ManualOrderSaveError, manualOrderErrorCode, toManualOrderMenu,
    type ManualOrderRequest, type ManualOrderSaveResult,
} from "@/features/admin/manualOrder";

async function saveManualOrder(request: ManualOrderRequest): Promise<ManualOrderSaveResult> {
    const response = await fetch("/api/admin/manual-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ManualOrderSaveError(manualOrderErrorCode(body));
    return body as ManualOrderSaveResult;
}

export default function ManualOrdersPage() {
    const admin = useMenuAdmin();
    const items = useMemo(() => toManualOrderMenu(admin.menus), [admin.menus]);
    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">수기 주문 사후 입력</h1>
                <Link href="/admin" className="text-sm underline">주문 대시보드</Link>
            </div>
            {admin.status === "loading" && <p role="status">메뉴를 불러오는 중입니다…</p>}
            {(admin.status === "error" || admin.status === "unavailable") && <div role="alert">
                관리자 메뉴를 불러오지 못했습니다. <button type="button" onClick={() => void admin.reload()} className="underline">다시 시도</button>
            </div>}
            {admin.status === "ready" && (items.length > 0
                ? <ManualOrderForm menu={items} onSave={saveManualOrder} />
                : <p role="status">입력할 수 있는 메뉴가 없습니다.</p>)}
        </div>
    );
}
