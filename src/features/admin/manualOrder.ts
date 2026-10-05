import { z } from "zod";
import type { MenuItemDto } from "@/lib/dto/menu";
import type { AdminMenuDto } from "@/lib/dto/adminMenu";

export type ManualOrderMenu = MenuItemDto & { isActive?: boolean };

// 관리자 조회는 판매 종료 메뉴·옵션도 포함한다. 종이 주문 사후 입력에서는 과거에 판매한 항목도 선택할 수 있어야 한다.
export function toManualOrderMenu(items: AdminMenuDto[]): ManualOrderMenu[] {
    const name = (translations: Record<string, { name: string }>) =>
        translations.ko?.name ?? translations.en?.name ?? "이름 없음";
    return items.map((item) => ({
        id: item.id,
        name: name(item.translations),
        description: item.translations.ko?.description ?? item.translations.en?.description ?? null,
        price: item.basePrice,
        stock: item.stock,
        isActive: item.isActive,
        isAvailable: item.isActive && !item.isSoldOutManual && item.stock > 0,
        isSoldOut: item.isSoldOutManual || item.stock === 0,
        imageUrl: item.imageUrl,
        optionGroups: item.optionGroups.map((group) => ({
            id: group.id,
            name: name(group.translations),
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: group.options.map((option) => ({
                id: option.id,
                name: name(option.translations),
                extraPrice: option.extraPrice,
            })),
        })),
    }));
}

// T-28 저장 API 계약. 가격은 보내지 않고 서버가 DB 가격·옵션을 스냅샷으로 확정한다.
export const ManualOrderRequestSchema = z.strictObject({
    idempotencyKey: z.uuid(),
    paymentMethod: z.enum(["cash", "transfer"]),
    manualOrderedAt: z.iso.datetime(),
    items: z.array(z.strictObject({
        menuItemId: z.guid(),
        quantity: z.int().min(1).max(99),
        optionIds: z.array(z.guid()),
    })).min(1).max(20),
});
export type ManualOrderRequest = z.infer<typeof ManualOrderRequestSchema>;

export type ManualOrderLine = {
    key: string;
    menuItemId: string;
    quantity: number;
    optionIds: string[];
};

export function manualOrderTotal(lines: ManualOrderLine[], menu: MenuItemDto[]): number {
    return lines.reduce((sum, line) => {
        const item = menu.find((candidate) => candidate.id === line.menuItemId);
        if (!item) return sum;
        const options = item.optionGroups.flatMap((group) => group.options);
        const optionsPrice = line.optionIds.reduce((price, id) =>
            price + (options.find((option) => option.id === id)?.extraPrice ?? 0), 0);
        return sum + (item.price + optionsPrice) * line.quantity;
    }, 0);
}

export function manualOrderShortages(lines: ManualOrderLine[], menu: MenuItemDto[]): string[] {
    return menu.filter((item) =>
        lines.filter((line) => line.menuItemId === item.id)
            .reduce((quantity, line) => quantity + line.quantity, 0) > item.stock,
    ).map((item) => item.name);
}

export function toManualOrderRequest(
    lines: ManualOrderLine[],
    menu: MenuItemDto[],
    paymentMethod: "cash" | "transfer",
    localKstTime: string,
    idempotencyKey: string,
): ManualOrderRequest | null {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localKstTime)) return null;
    const orderedAt = new Date(`${localKstTime}:00+09:00`);
    if (Number.isNaN(orderedAt.getTime()) || orderedAt > new Date()) return null;
    // 브라우저 Date가 존재하지 않는 날짜를 보정하는 경우를 거부한다.
    if (new Date(orderedAt.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16) !== localKstTime) return null;
    if (lines.some((line) => {
        const item = menu.find((candidate) => candidate.id === line.menuItemId);
        if (!item) return true;
        const selected = new Set(line.optionIds);
        return line.quantity < 1 || line.quantity > 99 || !Number.isInteger(line.quantity) ||
            item.optionGroups.some((group) => {
                const count = group.options.filter((option) => selected.has(option.id)).length;
                return count < group.minSelect || count > group.maxSelect;
            }) || selected.size !== line.optionIds.length ||
            line.optionIds.some((id) => !item.optionGroups.some((group) =>
                group.options.some((option) => option.id === id)));
    })) return null;
    const request = ManualOrderRequestSchema.safeParse({
        idempotencyKey, paymentMethod, manualOrderedAt: orderedAt.toISOString(),
        items: lines.map(({ menuItemId, quantity, optionIds }) => ({ menuItemId, quantity, optionIds })),
    });
    return request.success ? request.data : null;
}
