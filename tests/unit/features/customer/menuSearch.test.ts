import { describe, expect, it } from "vitest";
import { filterMenuItems } from "@/features/customer/menuSearch";
import type { MenuItemDto } from "@/lib/dto/menu";

function menu(id: string, name: string, description: string | null = null, isSoldOut = false): MenuItemDto {
    return {
        id,
        name,
        description,
        price: 2500,
        stock: isSoldOut ? 0 : 10,
        isAvailable: !isSoldOut,
        isSoldOut,
        imageUrl: null,
        optionGroups: [],
    };
}

const items = [
    menu("11111111-1111-1111-1111-111111111111", "기본호떡", "기본호떡"),
    menu("22222222-2222-2222-2222-222222222222", "치즈 호떡", "모짜렐라 치즈가 쭉 늘어나는 호떡"),
    menu("33333333-3333-3333-3333-333333333333", "씨앗 호떡", "해바라기씨·호박씨 등 견과류가 들어간 호떡", true),
    menu("44444444-4444-4444-4444-444444444444", "Bburinkle Hotteok", null),
];
const names = (result: MenuItemDto[]) => result.map((item) => item.name);

describe("filterMenuItems — 메뉴 검색(클라이언트)", () => {
    it("이름에 검색어가 들어간 메뉴만 원래 순서대로 돌려준다", () => {
        expect(names(filterMenuItems(items, "치즈"))).toEqual(["치즈 호떡"]);
        expect(names(filterMenuItems(items, "호떡"))).toEqual(["기본호떡", "치즈 호떡", "씨앗 호떡"]);
    });

    it("설명에만 들어간 검색어도 찾는다(재료로 찾기)", () => {
        expect(names(filterMenuItems(items, "견과류"))).toEqual(["씨앗 호떡"]);
    });

    it("품절 메뉴도 결과에 그대로 나온다", () => {
        expect(filterMenuItems(items, "씨앗")).toEqual([items[2]]);
    });

    it("경계: 빈 값·공백만 입력하면 전체 목록", () => {
        expect(filterMenuItems(items, "")).toEqual(items);
        expect(filterMenuItems(items, "   ")).toEqual(items);
    });

    it("경계: 앞뒤 공백은 무시하고, 영문 대소문자를 구분하지 않는다", () => {
        expect(names(filterMenuItems(items, "  치즈 "))).toEqual(["치즈 호떡"]);
        expect(names(filterMenuItems(items, "BBURINKLE"))).toEqual(["Bburinkle Hotteok"]);
        expect(names(filterMenuItems(items, "hotteok"))).toEqual(["Bburinkle Hotteok"]);
    });

    it("띄어쓰기가 달라도 찾는다(\"치즈호떡\" → \"치즈 호떡\")", () => {
        expect(names(filterMenuItems(items, "치즈호떡"))).toEqual(["치즈 호떡"]);
    });

    it("예외: 일치하는 메뉴가 없으면 빈 배열", () => {
        expect(filterMenuItems(items, "떡볶이")).toEqual([]);
    });

    it("예외: 메뉴가 0개면 무엇을 입력해도 빈 배열", () => {
        expect(filterMenuItems([], "호떡")).toEqual([]);
        expect(filterMenuItems([], "")).toEqual([]);
    });
});
