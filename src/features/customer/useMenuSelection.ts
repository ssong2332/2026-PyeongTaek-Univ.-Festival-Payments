"use client";

import { useState } from "react";
import { lineTotal } from "@/domain/order/pricing";
import type { MenuItemDto } from "@/lib/dto/menu";
import { koT, type Translate } from "@/lib/i18n/translate";
import {
    MAX_CART_LINES,
    findSelectionProblem,
    getMenuBlockReason,
    maxAddableQuantity,
    toggleOption,
} from "./menuRules";
import { cartFullMessage, menuBlockMessage, selectionProblemMessage, stockAlreadyInCartMessage } from "./messages";
import { lineIdOf, type AddCartItemInput, type CartItem } from "./useCart";

export interface MenuSelection {
    selectedIds: string[];
    toggle: (groupId: string, optionId: string) => void;
    quantity: number;
    setQuantity: (quantity: number) => void;
    maxQuantity: number;
    total: number;
    canAdd: boolean;
    message: string | null;
    cartInput: () => AddCartItemInput;
}

// 메뉴 상세 시트(Architecture 8절 MenuDetailSheet)의 상태. 시트를 열 때마다 새로 만든다(key = 메뉴 ID). t = 화면 언어 번역(기본 한국어). t = 화면 언어 번역(기본 한국어).
export function useMenuSelection(menu: MenuItemDto, cartItems: readonly CartItem[], t: Translate = koT): MenuSelection {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [requestedQuantity, setRequestedQuantity] = useState(1);

    const lineId = lineIdOf(menu.id, selectedIds);
    const inCartForMenu = cartItems.filter((item) => item.menuItemId === menu.id).reduce((sum, item) => sum + item.quantity, 0);
    const sameLineQuantity = cartItems.find((item) => item.lineId === lineId)?.quantity ?? 0;
    const maxQuantity = maxAddableQuantity({ stock: menu.stock, inCartForMenu, sameLineQuantity });
    const quantity = Math.max(1, Math.min(requestedQuantity, maxQuantity));

    const selectedOptions = menu.optionGroups.flatMap((group) =>
        group.options
            .filter((option) => selectedIds.includes(option.id))
            .map((option) => ({ id: option.id, groupName: group.name, name: option.name, extraPrice: option.extraPrice })),
    );

    const blockReason = getMenuBlockReason(menu);
    const problem = findSelectionProblem(menu.optionGroups, selectedIds);
    const cartFull = sameLineQuantity === 0 && cartItems.length >= MAX_CART_LINES;
    let message: string | null = null;
    if (blockReason) message = menuBlockMessage(blockReason, t);
    else if (maxQuantity === 0) message = stockAlreadyInCartMessage(t);
    else if (cartFull) message = cartFullMessage(t);
    else if (problem) message = selectionProblemMessage(problem, menu.optionGroups, t);

    return {
        selectedIds,
        toggle: (groupId, optionId) => setSelectedIds((prev) => toggleOption(menu.optionGroups, prev, groupId, optionId)),
        quantity,
        setQuantity: setRequestedQuantity,
        maxQuantity,
        total: lineTotal({ unitPrice: menu.price, quantity, options: selectedOptions }),
        canAdd: message === null,
        message,
        cartInput: () => ({ menuItemId: menu.id, name: menu.name, unitPrice: menu.price, quantity, options: selectedOptions }),
    };
}
