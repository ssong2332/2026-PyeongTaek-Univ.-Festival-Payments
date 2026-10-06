import type { MenuOptionGroupDto } from "@/lib/dto/menu";
import { koT, type Translate } from "@/lib/i18n/translate";
import type { CartIssue, MenuBlockReason, SelectionProblem } from "./menuRules";
import type { CheckoutError } from "./useCheckout";

// 고객 화면 판정 문구(F-05) — 사전(messages/*.json)의 키를 고른다. t를 안 넘기면 한국어.

const RETRYABLE: ReadonlySet<CheckoutError["kind"]> = new Set(["network", "server", "rateLimited", "unknown"]);

// 재시도 가능한 오류는 같은 멱등키로 다시 보내고, 나머지는 장바구니로 돌아가 고친다(Architecture 8절).
export function isRetryableCheckoutError(error: CheckoutError): boolean {
    return RETRYABLE.has(error.kind);
}

const withNames = (t: Translate, names: readonly string[]) => (names.length > 0 ? t("error.names", { names: names.join(", ") }) : "");

export function checkoutErrorMessage(error: CheckoutError, t: Translate = koT): string {
    switch (error.kind) {
        case "network":
            return t("error.checkout.network");
        case "server":
            return t("error.checkout.server");
        case "rateLimited":
            return t("error.checkout.rateLimited");
        case "outOfStock":
            return t("error.checkout.outOfStock");
        case "menuUnavailable":
            return t("error.checkout.menuUnavailable", { names: withNames(t, error.names) });
        case "invalidOption":
            return t("error.checkout.invalidOption", { names: withNames(t, error.names) });
        case "invalidOrder":
            return t("error.checkout.invalidOrder");
        case "unknown":
            return t("error.checkout.unknown");
    }
}

export function cartIssueMessage(issue: CartIssue, t: Translate = koT): string {
    switch (issue.kind) {
        case "unavailable":
            return t("cart.issue.unavailable");
        case "soldOut":
            return t("cart.issue.soldOut");
        case "optionsChanged":
            return t("cart.issue.optionsChanged");
        case "insufficientStock":
            return t("cart.issue.insufficientStock", { available: issue.available });
    }
}

export const stockAlreadyInCartMessage = (t: Translate = koT) => t("menu.block.stockInCart");
export const cartFullMessage = (t: Translate = koT) => t("menu.block.cartFull");

export function menuBlockMessage(reason: MenuBlockReason, t: Translate = koT): string {
    return reason === "soldOut" ? t("menu.block.soldOut") : t("menu.block.optionsUnavailable");
}

export function selectionHint(group: MenuOptionGroupDto, t: Translate = koT): string {
    if (group.minSelect === 0) {
        return group.maxSelect >= group.options.length ? t("option.hint.any") : t("option.hint.max", { max: group.maxSelect });
    }
    return group.maxSelect === group.minSelect
        ? t("option.hint.exact", { count: group.minSelect })
        : t("option.hint.range", { min: group.minSelect, max: group.maxSelect });
}

export function selectionProblemMessage(problem: SelectionProblem, groups: readonly MenuOptionGroupDto[], t: Translate = koT): string {
    if (problem.kind === "unknownOption") return t("option.problem.unknown");
    const group = groups.find((candidate) => candidate.id === problem.groupId);
    const name = group?.name ?? t("option.problem.fallbackName");
    return problem.kind === "tooFew"
        ? t("option.problem.tooFew", { name })
        : t("option.problem.tooMany", { name, max: group?.maxSelect ?? 0 });
}
