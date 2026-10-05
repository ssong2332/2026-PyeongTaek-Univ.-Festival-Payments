"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { motionDelay } from "@/components/motion/presets";
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
    // 성공하면 버튼이 캐러멜로 가득 찬 "주문 완료" 상태를 잠깐 보여 준 뒤 이동한다(애니메이션을 끈 환경은 바로 이동).
    const checkout = useCheckout({
        onSuccess: (order) => setTimeout(() => router.replace(`/orders/${order.statusToken}?new=1`), motionDelay(900)),
    });

    // 판정 순서: 성공(이동 중) → 저장값 읽기 전 → 빈 장바구니(제출 중이 아닐 때) → 결제 화면.
    let body: React.ReactNode = null;
    if (checkout.succeeded) {
        body = (
            <div className="flex flex-col items-center gap-4 py-14">
                <SuccessMark />
                <p role="status" className="text-center font-bold text-dough">
                    주문이 접수됐어요. 주문 화면으로 이동하고 있어요.
                </p>
            </div>
        );
    } else if (hydrated && items.length === 0 && !checkout.submitting) {
        body = (
            <EmptyState title="장바구니가 비어 있습니다">
                <Link
                    href="/"
                    className="iron-card rounded-full px-5 py-2.5 text-sm font-bold text-dough transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
                >
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

    const showConfirm = hydrated && (checkout.succeeded || items.length > 0 || checkout.submitting);
    let confirmLabel = "결제 방법을 선택해 주세요.";
    if (checkout.succeeded) confirmLabel = "주문 완료!";
    else if (checkout.submitting) confirmLabel = "주문을 보내는 중…";
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
                    {/* 주문 버튼: 보내는 동안 안쪽에 캐러멜이 왼쪽부터 차오르며 기포가 끓는다(진행 표시).
                        성공하면 캐러멜이 끝까지 차고 글자가 체크와 함께 "주문 완료!"로 바뀐다. */}
                    <button
                        type="button"
                        disabled={!checkout.canSubmit || checkout.succeeded}
                        aria-busy={checkout.submitting}
                        onClick={() => void checkout.submit()}
                        className={`${checkout.canSubmit || checkout.submitting || checkout.succeeded ? CTA_ENABLED : CTA_DISABLED} relative justify-center overflow-hidden disabled:cursor-default`}
                    >
                        <AnimatePresence>
                            {(checkout.submitting || checkout.succeeded) && (
                                <motion.span
                                    aria-hidden="true"
                                    initial={{ width: "0%" }}
                                    animate={{ width: checkout.succeeded ? "100%" : "88%" }}
                                    exit={{ opacity: 0 }}
                                    transition={checkout.succeeded ? { duration: 0.35, ease: "easeOut" } : { duration: 2.6, ease: [0.2, 0.7, 0.3, 1] }}
                                    className="absolute inset-y-0 left-0 -z-10 overflow-hidden bg-linear-to-r from-[#7a3410] via-[#9a4614] to-caramel"
                                >
                                    {/* 앞쪽 물결 경계 */}
                                    <motion.svg
                                        viewBox="0 0 20 60"
                                        preserveAspectRatio="none"
                                        className="absolute inset-y-0 -right-[14px] h-full w-4 text-caramel"
                                        animate={{ y: ["-10%", "10%", "-10%"] }}
                                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                                    >
                                        <path d="M0 0 H6 Q16 7.5 6 15 T6 30 T6 45 T6 60 H0 Z" fill="currentColor" />
                                    </motion.svg>
                                    {/* 끓는 기포 */}
                                    {Array.from({ length: 9 }, (_, index) => (
                                        <motion.span
                                            key={index}
                                            className="absolute bottom-0 rounded-full border border-[#ffd27a]/60 bg-[#ffd27a]/15"
                                            style={{ left: `${8 + index * 10}%`, width: 4 + (index % 3) * 3, height: 4 + (index % 3) * 3 }}
                                            animate={{ y: [0, -46], opacity: [0, 0.9, 0], scale: [0.6, 1, 1.2] }}
                                            transition={{ duration: 1 + (index % 4) * 0.25, repeat: Infinity, delay: index * 0.17, ease: "easeOut" }}
                                        />
                                    ))}
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/15 to-transparent" />
                                </motion.span>
                            )}
                        </AnimatePresence>
                        {checkout.succeeded && (
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 text-dough">
                                <motion.path
                                    d="M5 12.5l4.5 4.5L19 7.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.35, delay: 0.2 }}
                                />
                            </svg>
                        )}
                        <motion.span
                            key={confirmLabel}
                            initial={{ y: 14, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className={checkout.submitting || checkout.succeeded ? "text-dough" : ""}
                        >
                            {confirmLabel}
                        </motion.span>
                    </button>
                </BottomBar>
            )}
        </>
    );
}

// 주문 성공: 시럽빛 원이 차오르며 체크가 그려지고, 작은 불티 몇 개만 튄다(화면 전체를 덮는 축하는 하지 않는다).
function SuccessMark() {
    return (
        <span aria-hidden="true" className="relative flex size-24 items-center justify-center">
            <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 16 }}
                className="absolute inset-0 rounded-full bg-syrup shadow-[0_0_40px_rgba(255,181,71,0.55)]"
            />
            <svg viewBox="0 0 24 24" className="relative size-12">
                <motion.path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    fill="none"
                    stroke="#3b1a08"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
                />
            </svg>
            {Array.from({ length: 8 }, (_, index) => {
                const angle = (index / 8) * Math.PI * 2;
                return (
                    <motion.span
                        key={index}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                        animate={{ x: Math.cos(angle) * 64, y: Math.sin(angle) * 64, opacity: [0, 1, 0], scale: 0.4 }}
                        transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
                        className="absolute size-1.5 rounded-full bg-syrup"
                    />
                );
            })}
        </span>
    );
}

// 재시도할 수 있는 오류(네트워크·서버·429)는 같은 멱등키로 다시 보내고, 나머지는 장바구니에서 고친다.
function CheckoutErrorPanel({ error, onRetry }: { error: CheckoutError; onRetry: () => Promise<void> }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}
            transition={{ duration: 0.4 }}
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-chili/45 bg-chili/10 p-4 text-sm"
        >
            <p className="font-bold text-chili">{checkoutErrorMessage(error)}</p>
            {error.kind === "outOfStock" && error.shortages.length > 0 && (
                <ul className="list-disc pl-5 text-dough">
                    {error.shortages.map((shortage) => (
                        <li key={shortage.menuItemId}>
                            {shortage.name}: 남은 수량 {shortage.available}개
                        </li>
                    ))}
                </ul>
            )}
            {isRetryableCheckoutError(error) ? (
                <button
                    type="button"
                    onClick={() => void onRetry()}
                    className="self-start rounded-full bg-syrup px-4 py-2 font-bold text-molasses transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
                >
                    다시 시도
                </button>
            ) : (
                <Link href="/cart" className="iron-card self-start rounded-full px-4 py-2 font-bold text-dough focus-visible:outline-2 focus-visible:outline-syrup">
                    장바구니로 돌아가기
                </Link>
            )}
        </motion.div>
    );
}
