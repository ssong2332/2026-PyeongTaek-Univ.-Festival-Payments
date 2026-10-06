import type { CustomerIconName } from "./customerIcons";
import type { MenuItemDto } from "@/lib/dto/menu";

// 메뉴판 맛 칩. DB에 분류가 없어서 이름·설명의 낱말로 고른다(메뉴 10개 규모라 충분). 한 메뉴가 여러 칩에 들 수 있다.
// 화면 언어에 따라 이름·설명이 한국어 또는 영어로 오므로(F-05) 두 언어 낱말을 함께 본다. 칩 이름은 사전 category.{id}, 아이콘은 Flaticon(customerIcons).
export type MenuCategoryId = "all" | "sweet" | "cheese" | "seasoning" | "spicy";

export const MENU_CATEGORIES: readonly { id: MenuCategoryId; icon: CustomerIconName; pattern: RegExp | null }[] = [
    { id: "all", icon: "hotteok", pattern: null },
    { id: "sweet", icon: "honey", pattern: /달콤|달달|고구마|초코|꿀|흑설탕|sweet(?! corn)|choco|honey|syrup/i },
    { id: "cheese", icon: "cheese", pattern: /치즈|chees/i },
    { id: "seasoning", icon: "seasoning", pattern: /시즈닝|가루|허니버터|seasoning|powder|honey butter/i },
    { id: "spicy", icon: "chili", pattern: /불닭|매콤|매운|buldak|spicy/i },
];

export function inCategory(item: MenuItemDto, id: MenuCategoryId): boolean {
    const category = MENU_CATEGORIES.find((entry) => entry.id === id);
    if (!category?.pattern) return true;
    return category.pattern.test(`${item.name} ${item.description ?? ""}`);
}

// 메뉴가 1개 이상 들어가는 칩만 보인다(전체는 항상).
export function availableCategories(items: readonly MenuItemDto[]) {
    return MENU_CATEGORIES.filter((category) => category.id === "all" || items.some((item) => inCategory(item, category.id)));
}
