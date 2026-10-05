"use client";

import { motion } from "motion/react";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";

export interface QuantityStepperProps {
    value: number;
    max: number;
    onChange: (value: number) => void;
    min?: number;
    label?: string;
    size?: "md" | "sm";
}

// F-02: 1 미만으로 내려가지 않고, 상한(재고)을 넘지 않는다. 상한보다 많이 담겨 있으면 줄이기만 된다.
// 숫자는 롤링 카운터, +/- 버튼은 짧은 스프링으로 눌린다.
export function QuantityStepper({ value, max, onChange, min = 1, label = "수량", size = "md" }: QuantityStepperProps) {
    const button = size === "md" ? "size-10" : "size-8";
    const buttonClass = `flex ${button} items-center justify-center rounded-full bg-iron-3 text-dough disabled:text-dough-dim/40 focus-visible:outline-2 focus-visible:outline-syrup`;
    return (
        <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-full border border-iron-line bg-iron p-1">
            <motion.button
                type="button"
                aria-label="수량 줄이기"
                disabled={value <= min}
                onClick={() => onChange(value - 1)}
                whileTap={{ scale: 0.82 }}
                transition={{ type: "spring", stiffness: 700, damping: 15 }}
                className={buttonClass}
            >
                <MinusIcon className="size-4" />
            </motion.button>
            <span aria-live="polite" className={`font-num ${size === "md" ? "w-9 text-xl" : "w-7 text-base"} flex justify-center text-dough`}>
                <RollingNumber value={String(value)} />
            </span>
            <motion.button
                type="button"
                aria-label="수량 늘리기"
                disabled={value >= max}
                onClick={() => onChange(value + 1)}
                whileTap={{ scale: 0.82 }}
                transition={{ type: "spring", stiffness: 700, damping: 15 }}
                className={buttonClass}
            >
                <PlusIcon className="size-4" />
            </motion.button>
        </div>
    );
}
