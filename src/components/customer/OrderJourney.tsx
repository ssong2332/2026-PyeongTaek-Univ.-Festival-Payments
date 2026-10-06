"use client";

import { motion } from "motion/react";
import { CartIcon, CheckIcon, ReceiptIcon, UtensilsIcon } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/locale";

// 주문 여정(담기 → 결제 → 픽업): 장바구니·결제 화면 머리 아래에서 지금 어디쯤인지 보여 준다.
// 지난 단계는 체크, 지금 단계는 시럽빛으로 숨 쉬고, 두 점 사이 선은 왼쪽부터 차오른다.
const STEPS = [
    { key: "journey.cart", Icon: CartIcon },
    { key: "journey.pay", Icon: ReceiptIcon },
    { key: "journey.pickup", Icon: UtensilsIcon },
] as const;

export function OrderJourney({ step }: { step: 0 | 1 | 2 }) {
    const t = useT();
    return (
        // 목록(ol) 대신 그룹 — 화면의 실제 목록(장바구니 항목)과 섞이지 않게. 지금 단계는 aria-current로 알린다.
        <div role="group" aria-label={t("journey.label")} className="flex items-center px-6 pt-4">
            {STEPS.map(({ key, Icon }, index) => {
                const done = index < step;
                const current = index === step;
                return (
                    <div key={key} aria-current={current ? "step" : undefined} className={`flex items-center ${index < STEPS.length - 1 ? "flex-1" : ""}`}>
                        <span className="flex flex-col items-center gap-1">
                            <motion.span
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 420, damping: 20, delay: index * 0.08 }}
                                className={`relative flex size-9 items-center justify-center rounded-full border-2 ${
                                    done
                                        ? "border-syrup bg-syrup text-molasses"
                                        : current
                                          ? "border-syrup bg-iron-2 text-syrup shadow-[0_0_16px_rgba(255,181,71,0.45)]"
                                          : "border-iron-line bg-iron-2 text-dough-dim"
                                }`}
                            >
                                {current && <span aria-hidden="true" className="absolute -inset-1 rounded-full border border-syrup/50 motion-safe:animate-ping-soft" />}
                                {done ? <CheckIcon className="size-4" /> : <Icon className="size-4" />}
                            </motion.span>
                            <span className={`text-[11px] font-bold ${current ? "text-syrup" : done ? "text-dough" : "text-dough-dim"}`}>{t(key)}</span>
                        </span>
                        {index < STEPS.length - 1 && (
                            <span aria-hidden="true" className="relative mx-1.5 mb-5 h-1 flex-1 overflow-hidden rounded-full bg-iron-line">
                                <motion.span
                                    className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-caramel to-syrup"
                                    initial={{ width: "0%" }}
                                    animate={{ width: done ? "100%" : current ? "45%" : "0%" }}
                                    transition={{ duration: 0.7, delay: 0.2 + index * 0.15, ease: [0.3, 0, 0.2, 1] }}
                                />
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
