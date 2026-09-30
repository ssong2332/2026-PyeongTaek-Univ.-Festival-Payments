"use client";

import Link from "next/link";
import { CartSummary } from "@/components/customer/CartSummary";
import { BACK_LINK_CLASS, PageHeader } from "@/components/customer/PageHeader";
import { BottomBar } from "@/components/ui/BottomBar";
import { CTA_DISABLED, CTA_ENABLED } from "@/components/ui/cta";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRightIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
import { buildCartLines } from "@/features/customer/cartView";
import { selectCartCount, selectCartTotal, useCart, useCartHydrated } from "@/features/customer/useCart";
import { useMenu } from "@/features/customer/useMenu";
import { formatWon } from "@/lib/format";

// 장바구니(/cart) — PRD 화면 표 "고객 · 장바구니". 마운트 시 GET /api/menu로 품절·비활성을 다시 확인한다.
export default function CartPage() {
    const hydrated = useCartHydrated();
    const items = useCart((state) => state.items);
    const count = useCart(selectCartCount);
    const total = useCart(selectCartTotal);
    const update = useCart((state) => state.update);
    const remove = useCart((state) => state.remove);
    const menu = useMenu(DEFAULT_LOCALE, { pollQueue: false });

    const lines = buildCartLines(items, menu.status === "ready" ? menu.items : null);
    const hasIssue = lines.some((line) => line.warning !== null);
    const checking = menu.status === "loading";
    // 판정: 비었음·재검사 중·경고 항목 있음 → 진행 차단. 재검사 요청 실패는 막지 않는다(주문 API가 최종 검증).
    const canProceed = hydrated && items.length > 0 && !checking && !hasIssue;

    return (
        <>
            <PageHeader
                title="장바구니"
                back={
                    <Link href="/" aria-label="메뉴판으로" className={BACK_LINK_CLASS}>
                        <ChevronLeftIcon />
                    </Link>
                }
                right={hydrated && items.length > 0 ? <span className="text-sm text-stone-500">{count}개</span> : undefined}
            />

            <div className="flex flex-col gap-3 px-4 pt-4">
                {hydrated && items.length === 0 && (
                    <EmptyState title="장바구니가 비어 있습니다">
                        <Link href="/" className="rounded-full bg-orange-700 px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep">
                            메뉴판으로 돌아가기
                        </Link>
                    </EmptyState>
                )}
                {hydrated && items.length > 0 && (
                    <>
                        {menu.status === "error" && (
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
                                <p className="font-bold text-brand-deep">메뉴 정보를 확인하지 못했어요.</p>
                                <button type="button" onClick={menu.reload} className="shrink-0 rounded-full bg-white px-3 py-1 font-bold text-brand-deep shadow-sm">
                                    다시 확인
                                </button>
                            </div>
                        )}
                        {hasIssue && (
                            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                주문할 수 없는 항목이 있어요. 표시된 항목을 고쳐 주세요.
                            </p>
                        )}
                        <CartSummary lines={lines} onQuantityChange={update} onRemove={remove} />
                    </>
                )}
            </div>

            <BottomBar>
                {hydrated && items.length > 0 && (
                    <div className="mb-3 flex items-center justify-between">
                        <span id="cart-total-label" className="text-sm text-stone-600">
                            합계
                        </span>
                        <output aria-labelledby="cart-total-label" className="text-2xl font-extrabold text-brand-deep">
                            {formatWon(total)}
                        </output>
                    </div>
                )}
                {canProceed ? (
                    <Link href="/checkout" className={CTA_ENABLED}>
                        <span>주문하기</span>
                        <ArrowRightIcon className="size-5" />
                    </Link>
                ) : (
                    <button type="button" disabled className={CTA_DISABLED}>
                        <span>{checking && items.length > 0 ? "주문하기 (메뉴 확인 중)" : "주문하기"}</span>
                    </button>
                )}
            </BottomBar>
        </>
    );
}
