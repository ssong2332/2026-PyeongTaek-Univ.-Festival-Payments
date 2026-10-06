import type { CartLineView } from "@/components/customer/CartSummary";
import { lineTotal } from "@/domain/order/pricing";
import type { MenuItemDto } from "@/lib/dto/menu";
import { koT, type Translate } from "@/lib/i18n/translate";
import { menuImageUrl } from "./menuImages";
import { MAX_ITEM_QUANTITY, findCartIssues, maxLineQuantity } from "./menuRules";
import { cartIssueMessage } from "./messages";
import type { CartItem } from "./useCart";

// 담은 항목의 메뉴·옵션 이름. 지금 화면 언어로 받은 메뉴(current)에 있으면 그 이름, 없으면 담을 때의 이름(F-05).
export function cartItemNames(item: CartItem, current: MenuItemDto | undefined): { name: string; optionSummary: string } {
    const optionNames = new Map((current?.optionGroups ?? []).flatMap((group) => group.options.map((option) => [option.id, option.name] as const)));
    return {
        name: current?.name ?? item.name,
        optionSummary: item.options.map((option) => optionNames.get(option.id) ?? option.name).join(", "),
    };
}

// 장바구니 화면의 줄 정보. menus = 방금 받은 GET /api/menu 목록(아직 없거나 실패면 null — 재검사 없이 표시).
export function buildCartLines(items: readonly CartItem[], menus: readonly MenuItemDto[] | null, t: Translate = koT): CartLineView[] {
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
            ...cartItemNames(item, current),
            quantity: item.quantity,
            maxQuantity,
            lineTotal: lineTotal(item),
            imageUrl: menuImageUrl(item.menuItemId, current?.imageUrl ?? null),
            warning: issue ? cartIssueMessage(issue, t) : null,
        };
    });
}
