"use client";

import Link from "next/link";
import { useMenu } from "@/features/customer/useMenu";
import { ManualOrderForm } from "@/features/admin/ManualOrderForm";

export default function ManualOrdersPage() {
    const { status, items, reload } = useMenu("ko", { pollQueue: false });
    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">수기 주문 사후 입력</h1>
                <Link href="/admin" className="text-sm underline">주문 대시보드</Link>
            </div>
            {status === "loading" && <p role="status">메뉴를 불러오는 중입니다…</p>}
            {status === "error" && <div role="alert">
                메뉴를 불러오지 못했습니다. <button type="button" onClick={reload} className="underline">다시 시도</button>
            </div>}
            {status === "ready" && (items.length > 0
                ? <ManualOrderForm menu={items} />
                : <p role="status">입력할 수 있는 메뉴가 없습니다.</p>)}
        </div>
    );
}
