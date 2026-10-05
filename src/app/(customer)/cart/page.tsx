"use client";

import Link from "next/link";
import { CartSummary } from "@/components/customer/CartSummary";
import { BACK_LINK_CLASS, PageHeader } from "@/components/customer/PageHeader";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { BottomBar } from "@/components/ui/BottomBar";
import { CTA_DISABLED, CTA_ENABLED } from "@/components/ui/cta";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRightIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { buildCartLines } from "@/features/customer/cartView";
import { selectCartCount, selectCartTotal, useCart, useCartHydrated } from "@/features/customer/useCart";
import { useMenu } from "@/features/customer/useMenu";
import { formatWon } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/locale";

// 장바구니(/cart) — PRD 화면 표 "고객 · 장바구니". 마운트 시 GET /api/menu로 품절·비활성을 다시 확인한다.
export default function CartPage() {
    const hydrated = useCartHydrated();
    const items = useCart((state) => state.items);
    const count = useCart(selectCartCount);
    const total = useCart(selectCartTotal);
    const update = useCart((state) => state.update);
    const remove = useCart((state) => state.remove);
    const locale = useLocale();
    const t = useT();
    const menu = useMenu(locale, { pollQueue: false });

    const lines = buildCartLines(items, menu.status === "ready" ? menu.items : null, t);
    const hasIssue = lines.some((line) => line.warning !== null);
    const checking = menu.status === "loading";
    // 판정: 비었음·재검사 중·경고 항목 있음 → 진행 차단. 재검사 요청 실패는 막지 않는다(주문 API가 최종 검증).
    const canProceed = hydrated && items.length > 0 && !checking && !hasIssue;

    return (
        <>
            <PageHeader
                title={t("cart.title")}
                back={
                    <Link href="/" aria-label={t("nav.backToMenu")} className={BACK_LINK_CLASS}>
                        <ChevronLeftIcon />
                    </Link>
                }
                right={hydrated && items.length > 0 ? <span className="font-num text-sm text-syrup">{t("common.count", { count })}</span> : undefined}
            />

            <div className="flex flex-col gap-3 px-4 pt-4">
                {hydrated && items.length === 0 && (
                    <EmptyState title={t("cart.empty")}>
                        <Link href="/" className="iron-card rounded-full px-5 py-2.5 text-sm font-bold text-dough transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup">
                            {t("cart.backToMenu")}
                        </Link>
                    </EmptyState>
                )}
                {hydrated && items.length > 0 && (
                    <>
                        {menu.status === "error" && (
                            <div className="iron-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
                                <p className="font-bold text-dough">{t("cart.recheckFailed")}</p>
                                <button type="button" onClick={menu.reload} className="shrink-0 rounded-full bg-syrup px-3 py-1 font-bold text-molasses">
                                    {t("cart.recheck")}
                                </button>
                            </div>
                        )}
                        {hasIssue && (
                            <p role="alert" className="rounded-2xl border border-chili/40 bg-chili/10 px-4 py-3 text-sm font-bold text-chili">
                                {t("cart.hasIssue")}
                            </p>
                        )}
                        <CartSummary lines={lines} onQuantityChange={update} onRemove={remove} />
                    </>
                )}
            </div>

            <BottomBar>
                {hydrated && items.length > 0 && (
                    <div className="mb-3 flex items-center justify-between">
                        <span id="cart-total-label" className="text-sm text-dough-dim">
                            {t("common.total")}
                        </span>
                        <output aria-labelledby="cart-total-label" className="font-num relative text-3xl text-syrup">
                            <span key={total} aria-hidden="true" className="heat-pulse pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-lg" />
                            <RollingNumber value={formatWon(total, locale)} />
                        </output>
                    </div>
                )}
                {canProceed ? (
                    <Link href="/checkout" className={CTA_ENABLED}>
                        <span>{t("cart.order")}</span>
                        <ArrowRightIcon className="size-5" />
                    </Link>
                ) : (
                    <button type="button" disabled className={CTA_DISABLED}>
                        <span>{checking && items.length > 0 ? t("cart.orderChecking") : t("cart.order")}</span>
                    </button>
                )}
            </BottomBar>
        </>
    );
}
