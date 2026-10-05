"use client";

import { AnimatePresence, motion } from "motion/react";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { CloseIcon } from "@/components/ui/icons";
import { formatWon } from "@/lib/format";
import { MenuThumbnail } from "./MenuThumbnail";
import { QuantityStepper } from "./QuantityStepper";

export interface CartLineView {
    lineId: string;
    name: string;
    optionSummary: string;
    quantity: number;
    maxQuantity: number;
    lineTotal: number;
    imageUrl: string | null;
    warning: string | null;
}

export interface CartSummaryProps {
    lines: readonly CartLineView[];
    onQuantityChange: (lineId: string, quantity: number) => void;
    onRemove: (lineId: string) => void;
}

// 왼쪽으로 이만큼(px) 밀면 삭제(삭제 버튼과 같은 동작).
const SWIPE_DELETE_OFFSET = -110;

// 장바구니 줄. 왼쪽으로 밀면 뒤의 고추색 "삭제"가 드러나고, 지운 줄은 옆으로 빠지며 아래 줄들이 메워 올라온다(layout).
export function CartSummary({ lines, onQuantityChange, onRemove }: CartSummaryProps) {
    return (
        <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
                {lines.map((line, index) => (
                    <motion.li
                        key={line.lineId}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 28, delay: index * 0.04 } }}
                        exit={{ opacity: 0, x: -320, height: 0, marginTop: -12, transition: { duration: 0.28 } }}
                        className="relative overflow-hidden rounded-3xl"
                    >
                        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-end rounded-3xl bg-chili/90 pr-6 text-sm font-bold text-iron">
                            삭제
                        </span>
                        <motion.div
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={{ left: 0.6, right: 0.05 }}
                            onDragEnd={(_, info) => {
                                if (info.offset.x < SWIPE_DELETE_OFFSET) onRemove(line.lineId);
                            }}
                            className={`iron-card relative touch-pan-y rounded-3xl p-3 ${line.warning ? "!border-chili/70" : ""}`}
                        >
                            <div className="flex gap-3">
                                <MenuThumbnail imageUrl={line.imageUrl} className="size-20 rounded-full shadow-[0_8px_18px_rgba(0,0,0,0.45)]" />
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <div className="flex items-start gap-2">
                                        <p className="font-display min-w-0 flex-1 truncate text-lg text-dough">{line.name}</p>
                                        <button
                                            type="button"
                                            aria-label={`${line.name} 삭제`}
                                            onClick={() => onRemove(line.lineId)}
                                            className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-full text-dough-dim transition-colors hover:bg-chili/15 hover:text-chili active:scale-90 focus-visible:outline-2 focus-visible:outline-syrup"
                                        >
                                            <CloseIcon className="size-4" />
                                        </button>
                                    </div>
                                    {line.optionSummary && <p className="text-xs text-syrup/90">{line.optionSummary}</p>}
                                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                                        <QuantityStepper
                                            size="sm"
                                            label={`${line.name} 수량`}
                                            value={line.quantity}
                                            max={line.maxQuantity}
                                            onChange={(quantity) => onQuantityChange(line.lineId, quantity)}
                                        />
                                        <span className="font-num relative text-lg text-dough">
                                            <span key={line.lineTotal} aria-hidden="true" className="heat-pulse pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-lg" />
                                            <RollingNumber value={formatWon(line.lineTotal)} />
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {line.warning && <p className="mt-2 rounded-xl bg-chili/12 px-3 py-2 text-sm font-bold text-chili">{line.warning}</p>}
                        </motion.div>
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    );
}
