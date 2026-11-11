"use client";

import { useEffect, useState } from "react";
import { cookingSince, selectCookingOrders } from "@/domain/order/kitchenQueue";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { TransitionRequestError } from "@/features/admin/transitionError";

const ELAPSED_TICK_MS = 30_000;

export interface KitchenBoardProps {
    orders: AdminOrderDto[];
    isLoading: boolean;
    error: string | null;
    initialNow: string;
    onReload: () => Promise<void>;
    onComplete: (id: string) => Promise<void>;
}

function orderNumber(order: AdminOrderDto): string {
    return order.source === "manual" && order.manualNumber
        ? `M-${String(order.manualNumber).padStart(3, "0")}`
        : `#${String(order.pickupNumber).padStart(3, "0")}`;
}

function elapsedLabel(order: AdminOrderDto, now: number): string {
    const minutes = Math.floor((now - new Date(cookingSince(order)).getTime()) / 60_000);
    return minutes < 1 ? "방금 시작" : `${minutes}분째`;
}

// 요리사용 화면: 조리중 주문을 오래된 순으로 보여 주고, 다 만든 주문을 완료로 넘긴다.
// 손이 바쁜 자리라 번호·메뉴·수량을 크게 두고, 누를 것은 완료 버튼 하나만 둔다.
export function KitchenBoard({ orders, isLoading, error, initialNow, onReload, onComplete }: KitchenBoardProps) {
    const [now, setNow] = useState(() => new Date(initialNow).getTime());
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
    const [failure, setFailure] = useState("");

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
        return () => window.clearInterval(timer);
    }, []);

    const queue = selectCookingOrders(orders);

    async function complete(order: AdminOrderDto) {
        if (pendingIds.has(order.id)) return;
        setPendingIds((current) => new Set(current).add(order.id));
        setFailure("");
        try {
            await onComplete(order.id);
        } catch (err) {
            const reason = err instanceof TransitionRequestError ? err.message : "주문 상태를 확인하고 다시 시도해 주세요.";
            setFailure(`${orderNumber(order)} 완료 처리 실패. ${reason}`);
        } finally {
            setPendingIds((current) => {
                const next = new Set(current);
                next.delete(order.id);
                return next;
            });
        }
    }

    return (
        <section aria-label="조리 화면" className="flex flex-col gap-4 p-3 sm:p-6">
            <header className="flex items-baseline justify-between gap-3">
                <h1 className="text-xl font-bold text-dough">조리 화면</h1>
                <p className="text-sm font-semibold text-dough-dim">
                    조리중 <span className="font-num text-lg text-syrup">{queue.length}</span>건 · 오래된 순
                </p>
            </header>

            {failure && (
                <p role="alert" className="rounded-xl border border-chili/50 bg-chili/12 px-4 py-3 text-sm font-semibold text-chili">
                    {failure}
                </p>
            )}

            {error ? (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-chili/50 bg-chili/12 px-4 py-3 text-sm font-semibold text-chili">
                    <span>주문을 불러오지 못했습니다.</span>
                    <button type="button" onClick={() => void onReload()} className="shrink-0 rounded-lg border border-chili/60 px-3 py-1.5">
                        다시 불러오기
                    </button>
                </div>
            ) : isLoading ? (
                <p className="py-16 text-center text-dough-dim">주문을 불러오는 중입니다.</p>
            ) : queue.length === 0 ? (
                <p className="py-16 text-center text-lg font-semibold text-dough-dim">조리중인 주문이 없습니다.</p>
            ) : (
                <ol aria-label="조리중 주문" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {queue.map((order, index) => {
                        const pending = pendingIds.has(order.id);
                        return (
                            <li
                                key={order.id}
                                className={`flex flex-col gap-3 rounded-2xl border bg-iron-2 p-4 ${index === 0 ? "border-syrup" : "border-iron-line"}`}
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="font-num text-3xl text-dough">{orderNumber(order)}</span>
                                    <span className={`text-base font-bold ${index === 0 ? "text-syrup" : "text-dough-dim"}`}>{elapsedLabel(order, now)}</span>
                                </div>
                                {order.cancelRequestedAt && !order.cancelRejectedAt && (
                                    <p className="rounded-lg bg-chili/15 px-3 py-1.5 text-sm font-bold text-chili">취소 요청 있음 · 주문 관리에서 확인하세요</p>
                                )}
                                <ul className="flex flex-1 flex-col gap-2">
                                    {order.items.map((item, itemIndex) => (
                                        <li key={itemIndex}>
                                            <div className="flex items-baseline justify-between gap-3 text-lg font-bold text-dough">
                                                <span className="min-w-0">{item.menuNameKo}</span>
                                                <span className="font-num shrink-0 text-xl text-syrup">×{item.quantity}</span>
                                            </div>
                                            {item.options.length > 0 && (
                                                <p className="text-sm text-dough-dim">{item.options.map((option) => option.nameKo).join(", ")}</p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    onClick={() => void complete(order)}
                                    disabled={pending}
                                    aria-label={`${orderNumber(order)} 조리 완료`}
                                    className="min-h-14 rounded-xl bg-syrup text-lg font-bold text-molasses transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
                                >
                                    {pending ? "처리 중…" : "완료"}
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
