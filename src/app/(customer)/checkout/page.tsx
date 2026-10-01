"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderSummary } from "@/components/customer/OrderSummary";
import { BACK_LINK_CLASS, PageHeader } from "@/components/customer/PageHeader";
import { PaymentMethodPicker } from "@/components/customer/PaymentMethodPicker";
import { BottomBar } from "@/components/ui/BottomBar";
import { CTA_DISABLED, CTA_ENABLED } from "@/components/ui/cta";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { lineTotal } from "@/domain/order/pricing";
import { checkoutErrorMessage, isRetryableCheckoutError } from "@/features/customer/messages";
import { ENABLED_PAYMENT_METHODS } from "@/features/customer/paymentMethods";
import { selectCartTotal, useCart, useCartHydrated } from "@/features/customer/useCart";
import { useCheckout, type CheckoutError } from "@/features/customer/useCheckout";
import { formatWon } from "@/lib/format";

// 결제수단 선택 / 주문 확정(/checkout) — PRD 화면 표 "고객 · 결제수단 선택 / 주문 확정", Architecture 8절.
export default function CheckoutPage() {
    const router = useRouter();
    const hydrated = useCartHydrated();
    const items = useCart((state) => state.items);
    const total = useCart(selectCartTotal);
    // new=1: 주문 상태 페이지가 "주문 완료" 보기를 먼저 보여 준다(상태 페이지 담당과 맞춘 약속).
    const checkout = useCheckout({ onSuccess: (order) => router.replace(`/orders/${order.statusToken}?new=1`) });

    // 판정 순서: 성공(이동 중) → 저장값 읽기 전 → 빈 장바구니(제출 중이 아닐 때) → 결제 화면.
    let body: React.ReactNode = null;
    if (checkout.succeeded) {
        body = (
            <p role="status" className="rounded-2xl border border-orange-100 bg-white px-4 py-10 text-center font-bold text-brand-deep">
                주문이 접수됐어요. 주문 화면으로 이동하고 있어요.
            </p>
        );
    } else if (hydrated && items.length === 0 && !checkout.submitting) {
        body = (
            <EmptyState title="장바구니가 비어 있습니다">
                <Link href="/" className="rounded-full bg-orange-700 px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep">
                    메뉴판으로 돌아가기
                </Link>
            </EmptyState>
        );
    } else if (hydrated) {
        body = (
            <>
                <PaymentMethodPicker
                    value={checkout.paymentMethod}
                    onChange={checkout.selectPaymentMethod}
                    enabledMethods={ENABLED_PAYMENT_METHODS}
                    disabled={checkout.submitting}
                />
                <OrderSummary
                    lines={items.map((item) => ({
                        lineId: item.lineId,
                        name: item.name,
                        optionSummary: item.options.map((option) => option.name).join(", "),
                        quantity: item.quantity,
                        lineTotal: lineTotal(item),
                    }))}
                    total={total}
                />
                {checkout.error && <CheckoutErrorPanel error={checkout.error} onRetry={checkout.submit} />}
            </>
        );
    }

    const showConfirm = hydrated && !checkout.succeeded && (items.length > 0 || checkout.submitting);
    let confirmLabel = "결제 방법을 선택해 주세요.";
    if (checkout.submitting) confirmLabel = "주문을 보내는 중…";
    else if (checkout.paymentMethod) confirmLabel = `${formatWon(total)} 주문하기`;

    return (
        <>
            <PageHeader
                title="주문 정보"
                back={
                    <Link href="/cart" aria-label="장바구니로" className={BACK_LINK_CLASS}>
                        <ChevronLeftIcon />
                    </Link>
                }
            />
            <div className="flex flex-col gap-4 px-4 pt-4">{body}</div>
            {showConfirm && (
                <BottomBar>
                    <button
                        type="button"
                        disabled={!checkout.canSubmit}
                        aria-busy={checkout.submitting}
                        onClick={() => void checkout.submit()}
                        className={checkout.canSubmit ? CTA_ENABLED : CTA_DISABLED}
                    >
                        {confirmLabel}
                    </button>
                </BottomBar>
            )}
        </>
    );
}

// 재시도할 수 있는 오류(네트워크·서버·429)는 같은 멱등키로 다시 보내고, 나머지는 장바구니에서 고친다.
function CheckoutErrorPanel({ error, onRetry }: { error: CheckoutError; onRetry: () => Promise<void> }) {
    return (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-bold text-red-700">{checkoutErrorMessage(error)}</p>
            {error.kind === "outOfStock" && error.shortages.length > 0 && (
                <ul className="list-disc pl-5 text-red-700">
                    {error.shortages.map((shortage) => (
                        <li key={shortage.menuItemId}>
                            {shortage.name}: 남은 수량 {shortage.available}개
                        </li>
                    ))}
                </ul>
            )}
            {isRetryableCheckoutError(error) ? (
                <button type="button" onClick={() => void onRetry()} className="self-start rounded-full bg-orange-700 px-4 py-2 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep">
                    다시 시도
                </button>
            ) : (
                <Link href="/cart" className="self-start rounded-full bg-white px-4 py-2 font-bold text-brand-deep shadow-sm focus-visible:outline-2 focus-visible:outline-brand">
                    장바구니로 돌아가기
                </Link>
            )}
        </div>
    );
}
