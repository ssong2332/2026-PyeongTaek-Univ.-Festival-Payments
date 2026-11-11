import { z } from "zod";
import type { MenuItemDto } from "@/lib/dto/menu";
import type { AdminMenuDto } from "@/lib/dto/adminMenu";

type ManualOrderOptionGroup = MenuItemDto["optionGroups"][number] & { isActive?: boolean };
export type ManualOrderMenu = Omit<MenuItemDto, "optionGroups"> & {
    isActive?: boolean;
    optionGroups: ManualOrderOptionGroup[];
};

export function toManualOrderMenu(items: AdminMenuDto[]): ManualOrderMenu[] {
    const name = (translations: Record<string, { name: string }>) =>
        translations.ko?.name ?? translations.en?.name ?? "이름 없음";
    return items.map((item) => ({
        id: item.id,
        name: name(item.translations),
        description: item.translations.ko?.description ?? item.translations.en?.description ?? null,
        price: item.basePrice,
        stock: item.stock,
        isRecommended: item.isRecommended,
        isActive: item.isActive,
        isAvailable: item.isActive && !item.isSoldOutManual && item.stock > 0,
        isSoldOut: item.isSoldOutManual || item.stock === 0,
        imageUrl: item.imageUrl,
        optionGroups: item.optionGroups.map((group) => ({
            id: group.id,
            name: name(group.translations),
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            isActive: group.isActive,
            options: group.options.map((option) => ({
                id: option.id,
                name: name(option.translations),
                extraPrice: option.extraPrice,
            })),
        })),
    }));
}

export const ManualOrderRequestSchema = z.strictObject({
    idempotencyKey: z.uuid(),
    paymentMethod: z.enum(["cash", "transfer"]),
    manualOrderedAt: z.iso.datetime(),
    manualNumber: z.int().min(1).max(9999),
    items: z.array(z.strictObject({
        menuItemId: z.guid(),
        quantity: z.int().min(1).max(99),
        optionIds: z.array(z.guid()),
    })).min(1).max(20),
});
export type ManualOrderRequest = z.infer<typeof ManualOrderRequestSchema>;

export type ManualOrderSaveResult = {
    orderId: string;
    manualNumber: number;
    displayNumber: string;
    status: "completed";
    paymentMethod: "cash" | "transfer";
    totalAmount: number;
    manualOrderedAt: string;
    createdAt: string;
    created: boolean;
    stockShortages: Array<{ menuItemId: string; requested: number; available: number }>;
};

export class ManualOrderSaveError extends Error {
    constructor(public readonly code?: string) {
        super(code ?? "MANUAL_ORDER_SAVE_FAILED");
    }
}

/** Common API errors are wrapped as { error: { code, ... } }. */
export function manualOrderErrorCode(body: unknown): string | undefined {
    if (!body || typeof body !== "object" || !("error" in body)) return undefined;
    const error = body.error;
    if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return undefined;
    return error.code;
}

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
    menu: ManualOrderMenu[],
    paymentMethod: "cash" | "transfer",
    localKstTime: string,
    idempotencyKey: string,
    manualNumber: number,
): ManualOrderRequest | null {
    if (!Number.isInteger(manualNumber) || manualNumber < 1 || manualNumber > 9999) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localKstTime)) return null;
    const orderedAt = new Date(`${localKstTime}:00+09:00`);
    if (Number.isNaN(orderedAt.getTime()) || orderedAt > new Date()) return null;
    if (new Date(orderedAt.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16) !== localKstTime) return null;
    if (lines.some((line) => {
        const item = menu.find((candidate) => candidate.id === line.menuItemId);
        if (!item) return true;
        const selected = new Set(line.optionIds);
        return line.quantity < 1 || line.quantity > 99 || !Number.isInteger(line.quantity) ||
            item.optionGroups.some((group) => {
                const count = group.options.filter((option) => selected.has(option.id)).length;
                // 0104 create_manual_order: inactive historical groups keep maxSelect but do not require minSelect.
                const belowMinimum = group.isActive !== false && count < group.minSelect;
                return belowMinimum || count > group.maxSelect;
            }) || selected.size !== line.optionIds.length ||
            line.optionIds.some((id) => !item.optionGroups.some((group) =>
                group.options.some((option) => option.id === id)));
    })) return null;
    const request = ManualOrderRequestSchema.safeParse({
        idempotencyKey, paymentMethod, manualOrderedAt: orderedAt.toISOString(), manualNumber,
        items: lines.map(({ menuItemId, quantity, optionIds }) => ({ menuItemId, quantity, optionIds })),
    });
    return request.success ? request.data : null;
}
