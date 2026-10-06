"use client";

import { useRef, useState } from "react";
import { OrderDashboard } from "@/components/admin/OrderDashboard";
import { MenuManagementPanel, type MenuAdminApi } from "@/components/admin/MenuManagementPanel";
import { SettingsPanel, type SettingsApi } from "@/components/admin/SettingsPanel";
import type { AdminMenuDto } from "@/lib/dto/adminMenu";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import type { AdminReviewDto, AdminReviewsResponse } from "@/lib/dto/review";
import { aggregateStats } from "@/domain/stats/aggregate";
import { aggregateHourlyMenuSales } from "@/domain/stats/hourlySales";
import { availableActions, resolveTransition } from "@/domain/order/stateMachine";
import { summarizeRatings } from "@/domain/review/summary";
import { kstDate } from "@/domain/time/kst";
import { MenuLifecyclePanel } from "@/components/admin/MenuLifecyclePanel";
import { AttentionLayer, orderAlert, staffAlert, useAttention } from "@/components/admin/AttentionLayer";

async function loadPreviewStats(date: string) {
    const orders = makePreviewOrders().map(order => ({
        id: order.id, status: order.status, totalAmount: order.totalAmount,
        createdAt: order.source === "manual" && order.manualOrderedAt ? order.manualOrderedAt : order.createdAt,
        items: order.items.map(item => ({
            menuItemId: order.id, nameKo: item.menuNameKo, quantity: item.quantity,
        })),
    }));
    return { ...aggregateStats(orders, date), hourlyByMenu: aggregateHourlyMenuSales(orders, date) };
}

// 목업 후기(메모리) — 통계 화면의 후기 영역을 DB 없이 볼 수 있게 한다.
async function loadPreviewReviews(date: string): Promise<AdminReviewsResponse> {
    const reviews: AdminReviewDto[] = [
        { orderId: "00000000-0000-4000-8000-000000000004", pickupNumber: 4, manualNumber: null, rating: 5,
            text: "말차 화이트초코 호떡 최고예요! 또 올게요", createdAt: "2026-09-25T10:40:00.000Z" },
        { orderId: "00000000-0000-4000-8000-000000000005", pickupNumber: 2_100_000_001, manualNumber: 1, rating: 4,
            text: null, createdAt: "2026-09-25T10:35:00.000Z" },
        { orderId: "00000000-0000-4000-8000-000000000006", pickupNumber: 6, manualNumber: null, rating: 4,
            text: "줄이 조금 길었지만 맛있었어요", createdAt: "2026-09-25T10:20:00.000Z" },
    ].filter(review => date === "all" || kstDate(review.createdAt) === date);
    return { date, ...summarizeRatings(reviews.map(review => review.rating)), reviews };
}

export function makePreviewOrders(): AdminOrderDto[] {
    const menus = [["기본 호떡", 2000], ["뿌링클 호떡", 2500], ["불닭 콘치즈 호떡", 3500], ["말차 화이트초코 호떡", 3500]] as const;
    return menus.map(([name, price], i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        pickupNumber: i + 1, status: (["pending", "pending", "cooking", "completed"] as const)[i],
        paymentMethod: i % 2 ? "transfer" : "cash", totalAmount: price * 2,
        items: [{ menuNameKo: name, quantity: 2, options: [], lineTotal: price * 2 }],
        createdAt: `2026-09-25T10:${String(30 - i).padStart(2, "0")}:00.000Z`, updatedAt: "2026-09-25T10:30:00.000Z",
        acknowledgedAt: i < 2 ? null : "2026-09-25T10:30:00.000Z",
        transferReportedAt: i === 1 ? "2026-09-25T10:30:00.000Z" : null,
        cancelRequestedAt: null, cancelRejectedAt: null, paidAt: i > 1 ? "2026-09-25T10:30:00.000Z" : null,
        cookingStartedAt: null, completedAt: null, closedAt: null, refundChannel: null,
        lastReason: null, availableActions: availableActions({
            status: (["pending", "pending", "cooking", "completed"] as const)[i],
            paymentMethod: i % 2 ? "transfer" : "cash",
        }),
    }));
}
// 목업 미리보기용 메뉴(메모리) — 메뉴·재고 화면을 DB 없이 눌러 볼 수 있게 한다.
function previewMenus(): AdminMenuDto[] {
    const item = (id: string, ko: string, en: string, price: number, stock: number, extra: Partial<AdminMenuDto> = {}): AdminMenuDto => ({
        id, translations: { ko: { name: ko, description: null }, en: { name: en, description: null } },
        basePrice: price, stock, isRecommended: false, isSoldOutManual: false, isActive: true, sortOrder: 0, imageUrl: null, optionGroups: [], ...extra,
    });
    return [
        item("11111111-1111-1111-1111-111111111111", "기본 호떡", "Original Hotteok", 2000, 42, {
            optionGroups: [{
                id: "c0000000-0000-4000-8000-000000000001", translations: { ko: { name: "시즈닝 추가" }, en: { name: "Seasoning" } },
                minSelect: 0, maxSelect: 1, isActive: true,
                options: [
                    { id: "d0000000-0000-4000-8000-000000000001", translations: { ko: { name: "허니버터" }, en: { name: "Honey butter" } }, extraPrice: 500, isActive: true },
                    { id: "d0000000-0000-4000-8000-000000000002", translations: { ko: { name: "체다치즈" }, en: { name: "Cheddar" } }, extraPrice: 500, isActive: true },
                ],
            }],
        }),
        item("22222222-2222-2222-2222-222222222222", "뿌링클 호떡", "Bburinkle Hotteok", 2500, 0),
        item("99999999-9999-9999-9999-999999999999", "고구마 치즈 호떡", "Sweet Potato Cheese Hotteok", 3000, 12, { isSoldOutManual: true }),
    ];
}

function createPreviewMenuApi(): MenuAdminApi {
    let menus = previewMenus();
    const save = (menuId: string, change: (menu: AdminMenuDto) => AdminMenuDto) => {
        menus = menus.map(menu => (menu.id === menuId ? change(structuredClone(menu)) : menu));
        return structuredClone(menus.find(menu => menu.id === menuId)!);
    };
    const ownerOf = (predicate: (menu: AdminMenuDto) => boolean) => menus.find(predicate)?.id ?? menus[0].id;
    return {
        load: async () => structuredClone(menus),
        // 미리보기에서도 메뉴 추가(T-37)가 실제 화면처럼 동작하게 메모리에 더한다
        createMenu: async input => {
            const id = crypto.randomUUID();
            const created: AdminMenuDto = {
                id,
                translations: {
                    ko: { name: input.translations.ko.name, description: input.translations.ko.description || null },
                    en: { name: input.translations.en.name, description: input.translations.en.description || null },
                },
                basePrice: input.basePrice, stock: input.stock, isRecommended: false, isSoldOutManual: false, isActive: true,
                sortOrder: menus.length, imageUrl: null,
                optionGroups: (input.optionGroups ?? []).map(group => ({
                    id: crypto.randomUUID(), translations: group.translations, minSelect: group.minSelect, maxSelect: group.maxSelect, isActive: true,
                    options: group.options.map(option => ({ id: crypto.randomUUID(), translations: option.translations, extraPrice: option.extraPrice, isActive: true })),
                })),
            };
            menus = [...menus, created];
            return structuredClone(created);
        },
        updateMenu: async (id, patch) => save(id, menu => ({
            ...menu,
            basePrice: patch.basePrice ?? menu.basePrice,
            stock: patch.stock ?? menu.stock,
            isSoldOutManual: patch.isSoldOutManual ?? menu.isSoldOutManual,
            isActive: patch.isActive ?? menu.isActive,
            isRecommended: patch.isRecommended ?? menu.isRecommended,
            translations: {
                ...menu.translations,
                ...(patch.translations?.ko ? { ko: { name: patch.translations.ko.name, description: patch.translations.ko.description === undefined ? menu.translations.ko?.description ?? null : patch.translations.ko.description || null } } : {}),
                ...(patch.translations?.en ? { en: { name: patch.translations.en.name, description: patch.translations.en.description === undefined ? menu.translations.en?.description ?? null : patch.translations.en.description || null } } : {}),
            },
        })),
        updateOptionGroup: async (id, patch) => save(ownerOf(menu => menu.optionGroups.some(group => group.id === id)), menu => ({
            ...menu,
            optionGroups: menu.optionGroups.map(group => group.id !== id ? group : {
                ...group, minSelect: patch.minSelect ?? group.minSelect, maxSelect: patch.maxSelect ?? group.maxSelect,
                translations: { ...group.translations, ...patch.translations },
            }),
        })),
        updateOption: async (id, patch) => save(ownerOf(menu => menu.optionGroups.some(group => group.options.some(option => option.id === id))), menu => ({
            ...menu,
            optionGroups: menu.optionGroups.map(group => ({
                ...group,
                options: group.options.map(option => option.id !== id ? option : {
                    ...option, extraPrice: patch.extraPrice ?? option.extraPrice, isActive: patch.isActive ?? option.isActive,
                    translations: { ...option.translations, ...patch.translations },
                }),
            })),
        })),
    };
}

export function DashboardPreview() {
    const [orders, setOrders] = useState(makePreviewOrders);
    const current = useRef(orders);
    const [settingsApi] = useState<SettingsApi>(() => {
        let values = { "auto_complete.enabled": "false", "auto_complete.minutes": "15" };
        return {
            load: async () => ({ ...values }),
            save: async changes => { values = { ...values, ...changes }; return { ...values }; },
        };
    });
    const [menuApi] = useState(createPreviewMenuApi);
    function replace(next: AdminOrderDto[]) { current.current = next; setOrders(next); }
    // 화면 알림 미리보기: 새 주문·직원 호출이 들어온 것처럼 알림만 띄운다(주문판 데이터는 그대로)
    const attention = useAttention();
    const demoCount = useRef(44);
    function demoAlert(kind: "order" | "staff") {
        demoCount.current += 1;
        const pickupNumber = demoCount.current;
        attention.push(kind === "order"
            ? orderAlert({ id: `demo-${pickupNumber}`, pickupNumber, paymentMethod: "cash", totalAmount: 7000, items: [{ menuNameKo: "기본 호떡", quantity: 2 }, { menuNameKo: "뿌링클 호떡", quantity: 1 }] })
            : staffAlert({ id: `demo-${pickupNumber}`, pickupNumber }));
    }
    return <>
    <AttentionLayer alerts={attention.alerts} onDismiss={attention.dismiss} />
    <div className="flex flex-wrap justify-end gap-2 px-4 pt-3 text-sm font-bold sm:px-6">
        <span className="mr-auto self-center text-xs text-dough-dim">알림 미리보기</span>
        <button type="button" onClick={() => demoAlert("order")} className="rounded-lg border border-syrup/50 px-3 py-2 text-syrup">새 주문 알림 시험</button>
        <button type="button" onClick={() => demoAlert("staff")} className="rounded-lg border border-chili/50 px-3 py-2 text-chili">직원 호출 알림 시험</button>
    </div>
    <OrderDashboard orders={orders} preview settingsPanel={<SettingsPanel api={settingsApi} />} menuPanel={<><MenuLifecyclePanel api={menuApi} /><MenuManagementPanel api={menuApi} /></>}
        onReload={async () => replace(makePreviewOrders())}
        onLoadStats={loadPreviewStats}
        onLoadReviews={loadPreviewReviews}
        onSearch={async number => current.current.filter(order => order.pickupNumber === number)}
        onAcknowledge={async id => replace(current.current.map(order => order.id === id ? {
            ...order, acknowledgedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        } : order))}
        onTransition={async (id, action, input) => {
            const order = current.current.find(item => item.id === id);
            if (!order) throw new Error("Order not found");
            const result = resolveTransition(order, action, input ?? {});
            if (!result.ok) throw new Error(result.code);
            replace(current.current.map(item => item.id === id ? {
                ...item, status: result.to, updatedAt: new Date().toISOString(),
                lastReason: input?.reason ?? item.lastReason,
                refundChannel: input?.refundChannel ?? item.refundChannel,
                closedAt: result.restoreStock ? new Date().toISOString() : item.closedAt,
                availableActions: availableActions({ status: result.to, paymentMethod: item.paymentMethod }),
            } : item));
        }} />
    </>;
}
