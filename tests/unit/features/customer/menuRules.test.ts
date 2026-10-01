import { describe, expect, it } from "vitest";
import {
    MAX_CART_LINES,
    MAX_ITEM_QUANTITY,
    findCartIssues,
    findSelectionProblem,
    getMenuBlockReason,
    maxAddableQuantity,
    maxLineQuantity,
    toggleOption,
} from "@/features/customer/menuRules";
import { CreateOrderRequestSchema } from "@/lib/dto/order";
import type { MenuItemDto, MenuOptionGroupDto } from "@/lib/dto/menu";

const MENU_A = "11111111-1111-1111-1111-111111111111";
const MENU_B = "22222222-2222-2222-2222-222222222222";
const SUGAR = "aaaaaaaa-0000-0000-0000-000000000001";
const SUGAR_LOW = "aaaaaaaa-0000-0000-0000-00000000000a";
const SUGAR_HIGH = "aaaaaaaa-0000-0000-0000-00000000000b";
const TOPPING = "bbbbbbbb-0000-0000-0000-000000000001";
const NUTS = "bbbbbbbb-0000-0000-0000-00000000000a";
const CHEESE = "bbbbbbbb-0000-0000-0000-00000000000b";
const SYRUP = "bbbbbbbb-0000-0000-0000-00000000000c";
const SAUCE = "cccccccc-0000-0000-0000-000000000001";
const SAUCE_SPICY = "cccccccc-0000-0000-0000-00000000000a";

const sugarGroup: MenuOptionGroupDto = {
    id: SUGAR,
    name: "설탕 양",
    minSelect: 1,
    maxSelect: 1,
    options: [
        { id: SUGAR_LOW, name: "적게", extraPrice: 0 },
        { id: SUGAR_HIGH, name: "많이", extraPrice: 500 },
    ],
};
const toppingGroup: MenuOptionGroupDto = {
    id: TOPPING,
    name: "토핑",
    minSelect: 0,
    maxSelect: 2,
    options: [
        { id: NUTS, name: "견과류", extraPrice: 300 },
        { id: CHEESE, name: "치즈", extraPrice: 500 },
        { id: SYRUP, name: "시럽", extraPrice: 0 },
    ],
};
const sauceGroup: MenuOptionGroupDto = {
    id: SAUCE,
    name: "소스",
    minSelect: 0,
    maxSelect: 1,
    options: [{ id: SAUCE_SPICY, name: "매운 소스", extraPrice: 0 }],
};

function menu(overrides: Partial<MenuItemDto> = {}): MenuItemDto {
    return {
        id: MENU_A,
        name: "츄러스",
        description: null,
        price: 3000,
        stock: 10,
        isAvailable: true,
        isSoldOut: false,
        imageUrl: null,
        optionGroups: [sugarGroup, toppingGroup],
        ...overrides,
    };
}

describe("주문 규격 상한 (CreateOrderRequestSchema와 같은 값)", () => {
    const item = (quantity: number) => ({ menuItemId: MENU_A, quantity, optionIds: [] });
    const request = (items: ReturnType<typeof item>[]) => ({
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        paymentMethod: "cash",
        locale: "ko",
        items,
    });

    it("항목 수량 상한은 서버 규격과 같다", () => {
        expect(CreateOrderRequestSchema.safeParse(request([item(MAX_ITEM_QUANTITY)])).success).toBe(true);
        expect(CreateOrderRequestSchema.safeParse(request([item(MAX_ITEM_QUANTITY + 1)])).success).toBe(false);
    });

    it("장바구니 항목 개수 상한은 서버 규격과 같다", () => {
        expect(CreateOrderRequestSchema.safeParse(request(Array.from({ length: MAX_CART_LINES }, () => item(1)))).success).toBe(true);
        expect(CreateOrderRequestSchema.safeParse(request(Array.from({ length: MAX_CART_LINES + 1 }, () => item(1)))).success).toBe(false);
    });
});

describe("getMenuBlockReason — 담기 불가 이유", () => {
    it("판매 중이고 필수 옵션을 고를 수 있으면 null", () => {
        expect(getMenuBlockReason(menu())).toBeNull();
    });

    it("품절(F-25·F-26)이면 soldOut", () => {
        expect(getMenuBlockReason(menu({ isSoldOut: true, isAvailable: false, stock: 0 }))).toBe("soldOut");
    });

    it("필수 그룹(minSelect 1)의 선택지가 0개면 optionsUnavailable (팀장 결정 7)", () => {
        expect(getMenuBlockReason(menu({ optionGroups: [{ ...sugarGroup, options: [] }] }))).toBe("optionsUnavailable");
    });

    it("경계: minSelect 2에 선택지 2개면 담을 수 있고, 1개면 담을 수 없다", () => {
        const two = { ...toppingGroup, minSelect: 2, options: toppingGroup.options.slice(0, 2) };
        const one = { ...toppingGroup, minSelect: 2, options: toppingGroup.options.slice(0, 1) };
        expect(getMenuBlockReason(menu({ optionGroups: [two] }))).toBeNull();
        expect(getMenuBlockReason(menu({ optionGroups: [one] }))).toBe("optionsUnavailable");
    });

    it("선택 그룹(minSelect 0)은 선택지가 0개여도 담기를 막지 않는다", () => {
        expect(getMenuBlockReason(menu({ optionGroups: [{ ...toppingGroup, options: [] }] }))).toBeNull();
    });
});

describe("findSelectionProblem — 옵션 min/max", () => {
    const groups = [sugarGroup, toppingGroup];

    it("필수 1개 + 선택 토핑 2개(최대)면 문제 없음", () => {
        expect(findSelectionProblem(groups, [SUGAR_HIGH, NUTS, CHEESE])).toBeNull();
    });

    it("선택 그룹은 아무것도 고르지 않아도 된다", () => {
        expect(findSelectionProblem(groups, [SUGAR_LOW])).toBeNull();
    });

    it("필수 그룹을 고르지 않으면 tooFew", () => {
        expect(findSelectionProblem(groups, [NUTS])).toEqual({ kind: "tooFew", groupId: SUGAR });
    });

    it("maxSelect를 넘으면 tooMany", () => {
        expect(findSelectionProblem(groups, [SUGAR_LOW, NUTS, CHEESE, SYRUP])).toEqual({ kind: "tooMany", groupId: TOPPING });
    });

    it("메뉴에 없는 옵션 ID는 unknownOption", () => {
        expect(findSelectionProblem(groups, [SUGAR_LOW, SAUCE_SPICY])).toEqual({ kind: "unknownOption", optionId: SAUCE_SPICY });
    });
});

describe("toggleOption — 선택 토글", () => {
    const groups = [sugarGroup, toppingGroup, sauceGroup];

    it("단일 필수 그룹은 다른 선택지를 누르면 바꾸고, 같은 것을 다시 눌러도 해제하지 않는다", () => {
        const low = toggleOption(groups, [], SUGAR, SUGAR_LOW);
        expect(low).toEqual([SUGAR_LOW]);
        const high = toggleOption(groups, low, SUGAR, SUGAR_HIGH);
        expect(high).toEqual([SUGAR_HIGH]);
        expect(toggleOption(groups, high, SUGAR, SUGAR_HIGH)).toEqual([SUGAR_HIGH]);
    });

    it("단일 선택 그룹(minSelect 0)은 다시 누르면 해제된다", () => {
        const picked = toggleOption(groups, [], SAUCE, SAUCE_SPICY);
        expect(picked).toEqual([SAUCE_SPICY]);
        expect(toggleOption(groups, picked, SAUCE, SAUCE_SPICY)).toEqual([]);
    });

    it("복수 그룹은 maxSelect에 도달하면 더 추가하지 않고, 해제는 된다", () => {
        const full = [NUTS, CHEESE];
        expect(toggleOption(groups, full, TOPPING, SYRUP)).toEqual(full);
        expect(toggleOption(groups, full, TOPPING, NUTS)).toEqual([CHEESE]);
    });

    it("다른 그룹의 선택은 그대로 둔다", () => {
        expect(toggleOption(groups, [SUGAR_LOW, NUTS], SUGAR, SUGAR_HIGH)).toEqual([NUTS, SUGAR_HIGH]);
    });

    it("그룹에 속하지 않은 옵션은 무시한다", () => {
        expect(toggleOption(groups, [SUGAR_LOW], SUGAR, NUTS)).toEqual([SUGAR_LOW]);
        expect(toggleOption(groups, [SUGAR_LOW], "없는-그룹", NUTS)).toEqual([SUGAR_LOW]);
    });
});

describe("maxAddableQuantity — 상세에서 담을 수 있는 수량 (F-02)", () => {
    it("재고 5, 장바구니 0개 → 5", () => {
        expect(maxAddableQuantity({ stock: 5, inCartForMenu: 0, sameLineQuantity: 0 })).toBe(5);
    });

    it("재고 5, 같은 메뉴 3개 담김 → 2", () => {
        expect(maxAddableQuantity({ stock: 5, inCartForMenu: 3, sameLineQuantity: 0 })).toBe(2);
    });

    it("경계: 재고만큼 이미 담겼거나 재고 0이면 0", () => {
        expect(maxAddableQuantity({ stock: 5, inCartForMenu: 5, sameLineQuantity: 0 })).toBe(0);
        expect(maxAddableQuantity({ stock: 0, inCartForMenu: 0, sameLineQuantity: 0 })).toBe(0);
    });

    it("재고가 많아도 한 항목은 99개까지 — 같은 조합이 이미 있으면 그만큼 뺀다", () => {
        expect(maxAddableQuantity({ stock: 200, inCartForMenu: 0, sameLineQuantity: 0 })).toBe(99);
        expect(maxAddableQuantity({ stock: 200, inCartForMenu: 90, sameLineQuantity: 90 })).toBe(9);
    });
});

describe("maxLineQuantity — 장바구니 항목 수량 상한", () => {
    it("재고에서 같은 메뉴의 다른 항목 수량을 뺀다", () => {
        expect(maxLineQuantity({ stock: 5, otherLinesForMenu: 2 })).toBe(3);
    });

    it("경계: 99개를 넘지 않고, 음수가 되지 않는다", () => {
        expect(maxLineQuantity({ stock: 150, otherLinesForMenu: 0 })).toBe(99);
        expect(maxLineQuantity({ stock: 3, otherLinesForMenu: 5 })).toBe(0);
    });
});

describe("findCartIssues — 장바구니 재검사", () => {
    const line = (lineId: string, menuItemId: string, quantity: number, optionIds: string[] = [SUGAR_LOW]) => ({
        lineId,
        menuItemId,
        quantity,
        options: optionIds.map((id) => ({ id })),
    });

    it("모든 항목이 주문 가능하면 문제 없음", () => {
        expect(findCartIssues([line("a", MENU_A, 2)], [menu()]).size).toBe(0);
    });

    it("메뉴가 목록에서 사라졌으면(비활성) unavailable", () => {
        expect(findCartIssues([line("a", MENU_A, 1)], [menu({ id: MENU_B })]).get("a")).toEqual({ kind: "unavailable" });
    });

    it("품절이면 soldOut", () => {
        const issues = findCartIssues([line("a", MENU_A, 1)], [menu({ isSoldOut: true, isAvailable: false })]);
        expect(issues.get("a")).toEqual({ kind: "soldOut" });
    });

    it("담은 옵션이 사라졌으면 optionsChanged", () => {
        const withoutHigh = { ...sugarGroup, options: [sugarGroup.options[0]] };
        const issues = findCartIssues([line("a", MENU_A, 1, [SUGAR_HIGH])], [menu({ optionGroups: [withoutHigh] })]);
        expect(issues.get("a")).toEqual({ kind: "optionsChanged" });
    });

    it("같은 메뉴의 항목 수량 합이 재고를 넘으면 그 메뉴 항목 전부 insufficientStock", () => {
        const issues = findCartIssues(
            [line("a", MENU_A, 3), line("b", MENU_A, 3, [SUGAR_HIGH])],
            [menu({ stock: 5 })],
        );
        expect(issues.get("a")).toEqual({ kind: "insufficientStock", available: 5 });
        expect(issues.get("b")).toEqual({ kind: "insufficientStock", available: 5 });
    });

    it("경계: 수량 합이 재고와 같으면 문제 없음", () => {
        const issues = findCartIssues([line("a", MENU_A, 3), line("b", MENU_A, 2, [SUGAR_HIGH])], [menu({ stock: 5 })]);
        expect(issues.size).toBe(0);
    });
});
