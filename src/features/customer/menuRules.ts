import type { MenuItemDto, MenuOptionGroupDto } from "@/lib/dto/menu";

// CreateOrderRequestSchema의 items[].quantity 상한·items 개수 상한과 같은 값(tests/unit/features/customer/menuRules.test.ts가 대조).
export const MAX_ITEM_QUANTITY = 99;
export const MAX_CART_LINES = 20;

export type MenuBlockReason = "soldOut" | "optionsUnavailable";

// 팀장 결정 7(2026-10-01): 필수 그룹의 선택지가 minSelect보다 적으면 그 메뉴는 담을 수 없다.
export function getMenuBlockReason(menu: MenuItemDto): MenuBlockReason | null {
    if (!menu.isAvailable || menu.isSoldOut) return "soldOut";
    const unsatisfiable = menu.optionGroups.some((group) => group.minSelect >= 1 && group.options.length < group.minSelect);
    return unsatisfiable ? "optionsUnavailable" : null;
}

export type SelectionProblem =
    | { kind: "unknownOption"; optionId: string }
    | { kind: "tooFew"; groupId: string }
    | { kind: "tooMany"; groupId: string };

export function findSelectionProblem(groups: readonly MenuOptionGroupDto[], selectedIds: readonly string[]): SelectionProblem | null {
    const known = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
    const unknown = selectedIds.find((id) => !known.has(id));
    if (unknown) return { kind: "unknownOption", optionId: unknown };

    for (const group of groups) {
        const count = group.options.filter((option) => selectedIds.includes(option.id)).length;
        if (count < group.minSelect) return { kind: "tooFew", groupId: group.id };
        if (count > group.maxSelect) return { kind: "tooMany", groupId: group.id };
    }
    return null;
}

export function toggleOption(
    groups: readonly MenuOptionGroupDto[],
    selectedIds: readonly string[],
    groupId: string,
    optionId: string,
): string[] {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group || !group.options.some((option) => option.id === optionId)) return [...selectedIds];

    const groupOptionIds = new Set(group.options.map((option) => option.id));
    if (selectedIds.includes(optionId)) {
        // 필수 단일 선택(라디오)은 해제하지 않는다 — 다른 선택지를 눌러 바꾼다.
        if (group.minSelect === 1 && group.maxSelect === 1) return [...selectedIds];
        return selectedIds.filter((id) => id !== optionId);
    }
    if (group.maxSelect === 1) {
        return [...selectedIds.filter((id) => !groupOptionIds.has(id)), optionId];
    }
    const countInGroup = selectedIds.filter((id) => groupOptionIds.has(id)).length;
    if (countInGroup >= group.maxSelect) return [...selectedIds];
    return [...selectedIds, optionId];
}

// F-02: 수량 상한은 메뉴 재고. 서버는 같은 메뉴의 항목 수량을 합쳐 재고와 비교한다(create_order).
export function maxAddableQuantity(params: { stock: number; inCartForMenu: number; sameLineQuantity: number }): number {
    return Math.max(0, Math.min(params.stock - params.inCartForMenu, MAX_ITEM_QUANTITY - params.sameLineQuantity));
}

export function maxLineQuantity(params: { stock: number; otherLinesForMenu: number }): number {
    return Math.max(0, Math.min(params.stock - params.otherLinesForMenu, MAX_ITEM_QUANTITY));
}

export type CartIssue =
    | { kind: "unavailable" }
    | { kind: "soldOut" }
    | { kind: "optionsChanged" }
    | { kind: "insufficientStock"; available: number };

export interface CartLineRef {
    lineId: string;
    menuItemId: string;
    quantity: number;
    options: readonly { id: string }[];
}

export function findCartIssues(lines: readonly CartLineRef[], menus: readonly MenuItemDto[]): Map<string, CartIssue> {
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    const quantityByMenu = new Map<string, number>();
    for (const line of lines) {
        quantityByMenu.set(line.menuItemId, (quantityByMenu.get(line.menuItemId) ?? 0) + line.quantity);
    }

    const issues = new Map<string, CartIssue>();
    for (const line of lines) {
        const menu = menuById.get(line.menuItemId);
        if (!menu) {
            issues.set(line.lineId, { kind: "unavailable" });
        } else if (!menu.isAvailable || menu.isSoldOut) {
            issues.set(line.lineId, { kind: "soldOut" });
        } else if (findSelectionProblem(menu.optionGroups, line.options.map((option) => option.id))) {
            issues.set(line.lineId, { kind: "optionsChanged" });
        } else if ((quantityByMenu.get(menu.id) ?? 0) > menu.stock) {
            issues.set(line.lineId, { kind: "insufficientStock", available: menu.stock });
        }
    }
    return issues;
}
