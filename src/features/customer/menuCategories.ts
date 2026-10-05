import type { HotteokiMood } from "@/components/ui/HotteokMascot";
import type { MenuItemDto } from "@/lib/dto/menu";

// 메뉴판 맛 칩. DB에 분류가 없어서 이름·설명의 낱말로 고른다(메뉴 10개 규모라 충분). 한 메뉴가 여러 칩에 들 수 있다.
export type MenuCategoryId = "all" | "sweet" | "cheese" | "seasoning" | "spicy";

export const MENU_CATEGORIES: readonly { id: MenuCategoryId; label: string; mood: HotteokiMood; pattern: RegExp | null }[] = [
    { id: "all", label: "전체", mood: "hello", pattern: null },
    { id: "sweet", label: "달콤", mood: "shy", pattern: /달콤|달달|고구마|초코|꿀|흑설탕/ },
    { id: "cheese", label: "치즈", mood: "yummy", pattern: /치즈/ },
    { id: "seasoning", label: "시즈닝", mood: "excited", pattern: /시즈닝|가루|허니버터/ },
    { id: "spicy", label: "매콤", mood: "cool", pattern: /불닭|매콤|매운/ },
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
