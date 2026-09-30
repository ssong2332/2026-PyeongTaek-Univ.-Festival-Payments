import type { MenuOptionGroupDto } from "@/lib/dto/menu";
import type { CartIssue, MenuBlockReason, SelectionProblem } from "./menuRules";
import type { CheckoutError } from "./useCheckout";

// 고객 화면 문구(한국어 고정). T-04(다국어, P3)에서 messages/*.json의 errors.{code} 등으로 옮긴다.

const RETRYABLE: ReadonlySet<CheckoutError["kind"]> = new Set(["network", "server", "rateLimited", "unknown"]);

// 재시도 가능한 오류는 같은 멱등키로 다시 보내고, 나머지는 장바구니로 돌아가 고친다(Architecture 8절).
export function isRetryableCheckoutError(error: CheckoutError): boolean {
    return RETRYABLE.has(error.kind);
}

const withNames = (names: readonly string[]) => (names.length > 0 ? `: ${names.join(", ")}` : "");

export function checkoutErrorMessage(error: CheckoutError): string {
    switch (error.kind) {
        case "network":
            return "주문을 보내지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
        case "server":
            return "주문을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
        case "rateLimited":
            return "주문 요청이 많아요. 잠시 후 다시 시도해 주세요.";
        case "outOfStock":
            return "재고가 부족한 메뉴가 있어요. 장바구니에서 수량을 줄여 주세요.";
        case "menuUnavailable":
            return `지금 주문할 수 없는 메뉴가 있어요${withNames(error.names)}. 장바구니에서 빼 주세요.`;
        case "invalidOption":
            return `옵션이 바뀐 메뉴가 있어요${withNames(error.names)}. 장바구니에서 빼고 다시 담아 주세요.`;
        case "invalidOrder":
            return "주문 내용을 확인할 수 없어요. 장바구니를 다시 확인해 주세요.";
        case "unknown":
            return "주문 중 문제가 생겼어요. 다시 시도해 주세요.";
    }
}

export function cartIssueMessage(issue: CartIssue): string {
    switch (issue.kind) {
        case "unavailable":
            return "지금은 판매하지 않는 메뉴예요. 삭제해 주세요.";
        case "soldOut":
            return "품절된 메뉴예요. 삭제해 주세요.";
        case "optionsChanged":
            return "옵션이 바뀌었어요. 삭제 후 다시 담아 주세요.";
        case "insufficientStock":
            return `재고가 부족해요. 이 메뉴는 모두 합쳐 ${issue.available}개까지 주문할 수 있어요.`;
    }
}

export function menuBlockMessage(reason: MenuBlockReason): string {
    return reason === "soldOut" ? "품절된 메뉴예요." : "지금은 고를 수 있는 옵션이 없어 담을 수 없어요.";
}

export function selectionHint(group: MenuOptionGroupDto): string {
    if (group.minSelect === 0) {
        return group.maxSelect >= group.options.length ? "원하는 것만 선택" : `최대 ${group.maxSelect}개 선택`;
    }
    return group.maxSelect === group.minSelect
        ? `필수 · ${group.minSelect}개 선택`
        : `필수 · ${group.minSelect}~${group.maxSelect}개 선택`;
}

export function selectionProblemMessage(problem: SelectionProblem, groups: readonly MenuOptionGroupDto[]): string {
    if (problem.kind === "unknownOption") return "옵션을 다시 골라 주세요.";
    const group = groups.find((candidate) => candidate.id === problem.groupId);
    const name = group?.name ?? "옵션";
    return problem.kind === "tooFew"
        ? `‘${name}’을(를) 골라 주세요.`
        : `‘${name}’은(는) 최대 ${group?.maxSelect ?? 0}개까지 고를 수 있어요.`;
}
