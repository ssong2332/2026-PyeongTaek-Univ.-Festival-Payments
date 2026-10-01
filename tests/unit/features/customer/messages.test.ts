import { describe, expect, it } from "vitest";
import {
    cartIssueMessage,
    checkoutErrorMessage,
    isRetryableCheckoutError,
    menuBlockMessage,
    selectionHint,
    selectionProblemMessage,
} from "@/features/customer/messages";
import type { CheckoutError } from "@/features/customer/useCheckout";
import type { MenuOptionGroupDto } from "@/lib/dto/menu";

const group = (minSelect: number, maxSelect: number, optionCount = 3): MenuOptionGroupDto => ({
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "추가 옵션",
    minSelect,
    maxSelect,
    options: Array.from({ length: optionCount }, (_, i) => ({
        id: `aaaaaaaa-0000-0000-0000-00000000000${i}`,
        name: `옵션${i}`,
        extraPrice: 0,
    })),
});

describe("checkoutErrorMessage / isRetryableCheckoutError — 결제 화면 오류 판정표", () => {
    it.each<[CheckoutError, string, boolean]>([
        [{ kind: "network" }, "주문을 보내지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", true],
        [{ kind: "server" }, "주문을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.", true],
        [{ kind: "rateLimited" }, "주문 요청이 많아요. 잠시 후 다시 시도해 주세요.", true],
        [{ kind: "unknown" }, "주문 중 문제가 생겼어요. 다시 시도해 주세요.", true],
        [{ kind: "outOfStock", shortages: [] }, "재고가 부족한 메뉴가 있어요. 장바구니에서 수량을 줄여 주세요.", false],
        [{ kind: "menuUnavailable", names: ["기본호떡"] }, "지금 주문할 수 없는 메뉴가 있어요: 기본호떡. 장바구니에서 빼 주세요.", false],
        [{ kind: "menuUnavailable", names: [] }, "지금 주문할 수 없는 메뉴가 있어요. 장바구니에서 빼 주세요.", false],
        [{ kind: "invalidOption", names: ["치즈 호떡"] }, "옵션이 바뀐 메뉴가 있어요: 치즈 호떡. 장바구니에서 빼고 다시 담아 주세요.", false],
        [{ kind: "invalidOrder" }, "주문 내용을 확인할 수 없어요. 장바구니를 다시 확인해 주세요.", false],
    ])("%o", (error, message, retryable) => {
        expect(checkoutErrorMessage(error)).toBe(message);
        expect(isRetryableCheckoutError(error)).toBe(retryable);
    });
});

describe("cartIssueMessage — 장바구니 항목 경고", () => {
    it.each([
        [{ kind: "unavailable" } as const, "지금은 판매하지 않는 메뉴예요. 삭제해 주세요."],
        [{ kind: "soldOut" } as const, "품절된 메뉴예요. 삭제해 주세요."],
        [{ kind: "optionsChanged" } as const, "옵션이 바뀌었어요. 삭제 후 다시 담아 주세요."],
        [{ kind: "insufficientStock", available: 3 } as const, "재고가 부족해요. 이 메뉴는 모두 합쳐 3개까지 주문할 수 있어요."],
    ])("%o", (issue, message) => {
        expect(cartIssueMessage(issue)).toBe(message);
    });
});

describe("menuBlockMessage — 담기 불가 이유", () => {
    it("품절", () => {
        expect(menuBlockMessage("soldOut")).toBe("품절된 메뉴예요.");
    });

    it("필수 옵션 선택지 부족(팀장 결정 7)", () => {
        expect(menuBlockMessage("optionsUnavailable")).toBe("지금은 고를 수 있는 옵션이 없어 담을 수 없어요.");
    });
});

describe("selectionHint — 옵션 그룹 안내", () => {
    it.each([
        [group(0, 3), "원하는 것만 선택"],
        [group(0, 5), "원하는 것만 선택"],
        [group(0, 1), "최대 1개 선택"],
        [group(1, 1), "필수 · 1개 선택"],
        [group(1, 2), "필수 · 1~2개 선택"],
    ])("min %#", (g, hint) => {
        expect(selectionHint(g)).toBe(hint);
    });
});

describe("selectionProblemMessage", () => {
    it("필수 그룹 미선택", () => {
        expect(selectionProblemMessage({ kind: "tooFew", groupId: group(1, 1).id }, [group(1, 1)])).toBe("‘추가 옵션’을(를) 골라 주세요.");
    });

    it("최대 초과", () => {
        expect(selectionProblemMessage({ kind: "tooMany", groupId: group(0, 2).id }, [group(0, 2)])).toBe("‘추가 옵션’은(는) 최대 2개까지 고를 수 있어요.");
    });

    it("알 수 없는 옵션", () => {
        expect(selectionProblemMessage({ kind: "unknownOption", optionId: "x" }, [])).toBe("옵션을 다시 골라 주세요.");
    });
});
