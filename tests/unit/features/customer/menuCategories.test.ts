import { describe, expect, it } from "vitest";
import { availableCategories, inCategory, type MenuCategoryId } from "@/features/customer/menuCategories";
import type { MenuItemDto } from "@/lib/dto/menu";

// 맛 칩은 이름·설명 낱말로 고른다 — 화면 언어가 영어면 영어 이름·설명으로 와도 같은 칩에 들어야 한다(T-04).
const item = (name: string, description: string): MenuItemDto => ({
    id: "11111111-1111-1111-1111-111111111111",
    name,
    description,
    price: 2500,
    stock: 5,
    isAvailable: true,
    isSoldOut: false,
    imageUrl: null,
    optionGroups: [],
});

const chips = (menu: MenuItemDto) =>
    (["sweet", "cheese", "seasoning", "spicy"] as MenuCategoryId[]).filter((id) => inCategory(menu, id));

describe("menuCategories — 한국어·영어 같은 칩(seed 메뉴 기준)", () => {
    it.each([
        ["허니버터 호떡", "달콤한 호떡에 고소하고 진한 허니버터 풍미를 듬뿍!", "Honey Butter Hotteok", "Sweet hotteok with rich honey butter flavor."],
        ["불닭 콘치즈 호떡", "고소한 콘치즈에 매콤한 불닭소스와 불닭 마요를 더한 화끈한 호떡", "Buldak Corn Cheese Hotteok", "Corn cheese hotteok with spicy Buldak sauce and mayo."],
        ["뿌링클 호떡", "달콤한 호떡에 치즈 풍미 가득한 뿌링클 시즈닝을 듬뿍 입힌 단짠 호떡", "Bburinkle Hotteok", "Sweet hotteok coated in cheesy Bburinkle seasoning."],
        ["콘치즈 호떡", "톡톡 터지는 옥수수와 쭉 늘어나는 치즈가 가득한 고소한 호떡", "Corn Cheese Hotteok", "Hotteok filled with sweet corn and stretchy cheese."],
        ["콘소메 호떡", "바삭하게 구운 호떡에 짭짤하고 고소한 콘소메 시즈닝을 듬뿍!", "Consomme Hotteok", "Crispy hotteok coated in savory consomme seasoning."],
    ])("%s", (koName, koDescription, enName, enDescription) => {
        expect(chips(item(enName, enDescription))).toEqual(chips(item(koName, koDescription)));
    });

    it("전체 칩은 항상 있다", () => {
        expect(availableCategories([]).map((category) => category.id)).toEqual(["all"]);
    });
});
