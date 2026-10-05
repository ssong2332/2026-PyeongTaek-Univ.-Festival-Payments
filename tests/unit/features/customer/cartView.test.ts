import { describe, expect, it } from "vitest";
import { buildCartLines } from "@/features/customer/cartView";
import { menuImageUrl } from "@/features/customer/menuImages";
import type { CartItem } from "@/features/customer/useCart";
import type { MenuItemDto } from "@/lib/dto/menu";

const MENU_A = "11111111-1111-1111-1111-111111111111";
const MENU_B = "22222222-2222-2222-2222-222222222222";
const NUTS = { id: "bbbbbbbb-0000-0000-0000-00000000000a", groupName: "추가 옵션", name: "견과류 추가", extraPrice: 500 };
const CINNAMON = { id: "bbbbbbbb-0000-0000-0000-00000000000b", groupName: "추가 옵션", name: "시나몬", extraPrice: 0 };

function menu(overrides: Partial<MenuItemDto> = {}): MenuItemDto {
    return {
        id: MENU_A,
        name: "치즈 호떡",
        description: null,
        price: 2500,
        stock: 5,
        isAvailable: true,
        isSoldOut: false,
        imageUrl: "https://example.com/cheese.jpg",
        optionGroups: [{
            id: "bbbbbbbb-0000-0000-0000-000000000001",
            name: "추가 옵션",
            minSelect: 0,
            maxSelect: 3,
            options: [NUTS, CINNAMON].map(({ id, name, extraPrice }) => ({ id, name, extraPrice })),
        }],
        ...overrides,
    };
}

const item = (lineId: string, menuItemId: string, quantity: number, options = [NUTS]): CartItem => ({
    lineId,
    menuItemId,
    name: menuItemId === MENU_A ? "치즈 호떡" : "기본호떡",
    unitPrice: menuItemId === MENU_A ? 2500 : 2000,
    quantity,
    options,
});

describe("buildCartLines — 장바구니 화면 줄 정보", () => {
    it("이름·옵션 요약·줄 금액·썸네일, 수량 상한 = 재고 − 같은 메뉴 다른 항목", () => {
        const lines = buildCartLines([item("a", MENU_A, 2, [NUTS, CINNAMON]), item("b", MENU_A, 1, [])], [menu()]);
        expect(lines[0]).toEqual({
            lineId: "a",
            name: "치즈 호떡",
            optionSummary: "견과류 추가, 시나몬",
            quantity: 2,
            maxQuantity: 4,
            lineTotal: 6000,
            imageUrl: "https://example.com/cheese.jpg",
            warning: null,
        });
        expect(lines[1]).toMatchObject({ optionSummary: "", maxQuantity: 3, lineTotal: 2500, warning: null });
    });

    it("메뉴 정보를 아직 못 받았으면(null) 경고 없이 99개까지, 사진은 메뉴 ID로 찾은 기본 사진", () => {
        const [line] = buildCartLines([item("a", MENU_A, 2)], null);
        expect(line).toMatchObject({ maxQuantity: 99, warning: null, imageUrl: menuImageUrl(MENU_A, null) });
    });

    it("품절이면 경고, 수량을 늘릴 수 없다(상한 = 현재 수량)", () => {
        const [line] = buildCartLines([item("a", MENU_A, 2)], [menu({ isSoldOut: true, isAvailable: false })]);
        expect(line.warning).toBe("품절된 메뉴예요. 삭제해 주세요.");
        expect(line.maxQuantity).toBe(2);
    });

    it("목록에서 사라진 메뉴는 판매 중지 경고", () => {
        const [line] = buildCartLines([item("a", MENU_B, 1, [])], [menu()]);
        expect(line.warning).toBe("지금은 판매하지 않는 메뉴예요. 삭제해 주세요.");
        expect(line.maxQuantity).toBe(1);
    });

    it("경계: 재고보다 많이 담겨 있으면 재고 부족 경고와 줄어든 상한", () => {
        const [first, second] = buildCartLines([item("a", MENU_A, 4), item("b", MENU_A, 3, [])], [menu({ stock: 5 })]);
        expect(first.warning).toBe("재고가 부족해요. 이 메뉴는 모두 합쳐 5개까지 주문할 수 있어요.");
        expect(first.maxQuantity).toBe(2);
        expect(second.maxQuantity).toBe(1);
    });
});
