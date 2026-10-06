"use client";

import { motion } from "motion/react";
import { BankIcon, CashIcon } from "@/components/ui/icons";
import type { PaymentMethod } from "@/domain/order/status";
import { useT } from "@/lib/i18n/locale";
import { HotteokMascot } from "@/components/ui/HotteokMascot";

const METHODS: { value: PaymentMethod; Icon: typeof CashIcon }[] = [
    { value: "cash", Icon: CashIcon },
    { value: "transfer", Icon: BankIcon },
];

export interface PaymentMethodPickerProps {
    value: PaymentMethod | null;
    onChange: (method: PaymentMethod) => void;
    // 지금 받는 결제수단. 여기에 없는 것은 "(준비 중)"으로 비활성 표시한다.
    enabledMethods: readonly PaymentMethod[];
    disabled?: boolean;
}

// F-06: 현금 / 계좌이체 중 하나. 고른 카드로 시럽빛 테두리가 미끄러져 옮겨 가고(layoutId), 라디오 점이 톡 찬다.
export function PaymentMethodPicker({ value, onChange, enabledMethods, disabled = false }: PaymentMethodPickerProps) {
    const t = useT();
    return (
        <section className="iron-card relative rounded-3xl p-4">
            {/* 동전 든 호떡이가 카드 귀퉁이에서 기다리다, 고르면 신나서 뛴다 */}
            <HotteokMascot
                variant={value ? "excited" : "pay"}
                size={58}
                motion={value ? "jump" : "bob"}
                className="absolute top-1 right-3"
            />
            <h2 id="payment-method-title" className="font-display mb-3 text-lg text-dough">
                {t("payment.title")}
            </h2>
            <div role="radiogroup" aria-labelledby="payment-method-title" className="flex flex-col gap-2">
                {METHODS.map(({ value: method, Icon }) => {
                    const checked = value === method;
                    const available = enabledMethods.includes(method);
                    const inactive = disabled || !available;
                    return (
                        <label
                            key={method}
                            className={`relative flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-iron-line bg-iron/60 px-4 py-3 transition-transform active:scale-[0.985] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-syrup ${
                                inactive ? "cursor-not-allowed opacity-50" : ""
                            }`}
                        >
                            {checked && (
                                <motion.span
                                    layoutId="payment-method-selected"
                                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                    aria-hidden="true"
                                    className="absolute -inset-px rounded-2xl border-2 border-syrup bg-syrup/8 shadow-[0_0_24px_rgba(255,181,71,0.18)]"
                                />
                            )}
                            <input
                                type="radio"
                                name="payment-method"
                                value={method}
                                checked={checked}
                                disabled={inactive}
                                onChange={() => {
                                    if (!inactive) onChange(method);
                                }}
                                className="sr-only"
                            />
                            <span className={`relative flex size-10 items-center justify-center rounded-xl transition-colors ${checked ? "bg-syrup text-molasses" : "bg-iron-3 text-dough-dim"}`}>
                                <Icon className="size-5" />
                            </span>
                            <span className="relative flex flex-1 flex-col">
                                <span className="text-[15px] font-bold text-dough">
                                    {t(`payment.${method}` as const)}
                                    {!available && (
                                        <>
                                            {" "}
                                            <span className="text-xs font-medium">{t("payment.preparing")}</span>
                                        </>
                                    )}
                                </span>
                                <span aria-hidden="true" className="text-xs text-dough-dim">
                                    {t(`payment.${method}.caption` as const)}
                                </span>
                            </span>
                            <span aria-hidden="true" className={`relative flex size-5 items-center justify-center rounded-full border-2 ${checked ? "border-syrup" : "border-dough-dim/50"}`}>
                                <motion.span
                                    initial={false}
                                    animate={{ scale: checked ? 1 : 0 }}
                                    transition={{ type: "spring", stiffness: 600, damping: 20 }}
                                    className="size-2.5 rounded-full bg-syrup"
                                />
                            </span>
                        </label>
                    );
                })}
            </div>
            {value && (
                <motion.p
                    key={value}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 rounded-xl border border-syrup/30 bg-syrup/8 px-4 py-3 text-sm font-medium text-dough"
                >
                    {value === "cash" ? t("payment.cash.notice") : t("payment.transfer.notice")}
                </motion.p>
            )}
        </section>
    );
}
