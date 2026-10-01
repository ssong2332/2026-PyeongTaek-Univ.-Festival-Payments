import type { CartLineView } from "@/components/customer/CartSummary";
import { lineTotal } from "@/domain/order/pricing";
import type { MenuItemDto } from "@/lib/dto/menu";
import { MAX_ITEM_QUANTITY, findCartIssues, maxLineQuantity } from "./menuRules";
import { cartIssueMessage } from "./messages";
import type { CartItem } from "./useCart";

// 장바구니 화면의 줄 정보. menus = 방금 받은 GET /api/menu 목록(아직 없거나 실패면 null — 재검사 없이 표시).
export function buildCartLines(items: readonly CartItem[], menus: readonly MenuItemDto[] | null): CartLineView[] {
    const issues = menus ? findCartIssues(items, menus) : new Map();
    const menuById = new Map((menus ?? []).map((menu) => [menu.id, menu]));

    return items.map((item) => {
        const current = menuById.get(item.menuItemId);
        const issue = issues.get(item.lineId);
        const otherLinesForMenu = items
            .filter((other) => other.menuItemId === item.menuItemId && other.lineId !== item.lineId)
            .reduce((sum, other) => sum + other.quantity, 0);

        let maxQuantity = MAX_ITEM_QUANTITY;
        if (menus) {
            const orderable = current !== undefined && current.isAvailable && !current.isSoldOut;
            maxQuantity = orderable ? maxLineQuantity({ stock: current.stock, otherLinesForMenu }) : item.quantity;
        }

        return {
            lineId: item.lineId,
            name: item.name,
            optionSummary: item.options.map((option) => option.name).join(", "),
            quantity: item.quantity,
            maxQuantity,
            lineTotal: lineTotal(item),
            imageUrl: current?.imageUrl ?? null,
            warning: issue ? cartIssueMessage(issue) : null,
        };
    });
}
