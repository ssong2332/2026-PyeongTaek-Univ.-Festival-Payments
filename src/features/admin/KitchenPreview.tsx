"use client";

import { useState } from "react";
import { KitchenBoard } from "@/components/admin/KitchenBoard";
import { availableActions } from "@/domain/order/stateMachine";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

// /dev/kitchen 미리보기용 조리중 주문. 일부러 오래된 순이 아니게 넣어 정렬을 눈으로 확인한다.
function makeKitchenOrders(initialNow: string): AdminOrderDto[] {
    const base = new Date(initialNow).getTime();
    const samples = [
        { pickupNumber: 12, minutesAgo: 2, menus: [["기본 호떡", 2], ["뿌링클 호떡", 1]] },
        { pickupNumber: 9, minutesAgo: 11, menus: [["불닭 콘치즈 호떡", 3]] },
        { pickupNumber: 14, minutesAgo: 0, menus: [["말차 화이트초코 호떡", 1]] },
        { pickupNumber: 10, minutesAgo: 6, menus: [["기본 호떡", 4]] },
    ] as const;
    return samples.map((sample, index) => {
        const startedAt = new Date(base - sample.minutesAgo * 60_000).toISOString();
        return {
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            pickupNumber: sample.pickupNumber,
            status: "cooking",
            paymentMethod: "transfer",
            totalAmount: 0,
            items: sample.menus.map(([menuNameKo, quantity]) => ({
                menuNameKo,
                quantity,
                options: menuNameKo === "기본 호떡" ? [{ nameKo: "시나몬 추가", extraPrice: 0 }] : [],
                lineTotal: 0,
            })),
            createdAt: startedAt,
            updatedAt: startedAt,
            acknowledgedAt: startedAt,
            transferReportedAt: startedAt,
            cancelRequestedAt: index === 3 ? startedAt : null,
            cancelRejectedAt: null,
            paidAt: startedAt,
            cookingStartedAt: startedAt,
            completedAt: null,
            closedAt: null,
            refundChannel: null,
            lastReason: null,
            availableActions: availableActions({ status: "cooking", paymentMethod: "transfer" }),
        };
    });
}

export function KitchenPreview({ initialNow }: { initialNow: string }) {
    const [orders, setOrders] = useState(() => makeKitchenOrders(initialNow));
    return (
        <>
            <p className="border-b border-syrup/30 bg-syrup/10 px-4 py-2 text-sm text-syrup">목업 미리보기 · 실제 주문과 연결되지 않습니다. 새로고침하면 처음으로 돌아가요.</p>
            <KitchenBoard
                orders={orders}
                isLoading={false}
                error={null}
                initialNow={initialNow}
                onReload={async () => {}}
                onComplete={async (id) => setOrders((current) => current.filter((order) => order.id !== id))}
            />
        </>
    );
}
