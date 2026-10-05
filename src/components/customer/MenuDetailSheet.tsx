"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { CTA_DISABLED, CTA_ENABLED } from "@/components/ui/cta";
import { CartIcon, CloseIcon } from "@/components/ui/icons";
import { formatOptionPrice, formatWon } from "@/lib/format";
import { MenuThumbnail } from "./MenuThumbnail";
import { OptionSelector, type OptionGroupView } from "./OptionSelector";
import { QuantityStepper } from "./QuantityStepper";

export interface MenuDetailSheetProps {
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    groups: readonly OptionGroupView[];
    selectedIds: readonly string[];
    onToggleOption: (groupId: string, optionId: string) => void;
    quantity: number;
    maxQuantity: number;
    onQuantityChange: (quantity: number) => void;
    total: number;
    canAdd: boolean;
    message: string | null;
    onAdd: () => void;
    onClose: () => void;
    // 메뉴 카드 사진과 같은 값 — 누른 카드의 사진이 이 자리로 이어져 커진다(shared element).
    imageLayoutId?: string;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";
// 손잡이·사진을 이만큼(px) 끌어내리거나 빠르게 튕기면 닫는다.
const DISMISS_OFFSET = 120;
const DISMISS_VELOCITY = 600;

// Architecture 8절: 메뉴판(/) 위의 모달(라우트 없음). 아래에서 올라오는 철판 시트, 위쪽을 끌어내려 닫는다.
// 누른 카드의 호떡 사진이 시트 위 큰 사진으로 이어지고, 고른 옵션의 가격표가 "담을 구성" 칸으로 날아와 쌓인다.
export function MenuDetailSheet(props: MenuDetailSheetProps) {
    const { name, description, price, imageUrl, onClose } = props;
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const dragControls = useDragControls();
    const chosen = props.groups.flatMap((group) => group.options.filter((option) => props.selectedIds.includes(option.id)));

    // 열 때 닫기 버튼으로 초점을 옮기고 뒤 화면 스크롤을 막는다. 닫으면 원래 자리로 돌려놓는다.
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        return () => {
            document.body.style.overflow = overflow;
            previous?.focus();
        };
    }, []);

    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            onClose();
            return;
        }
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    return (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
            <motion.div
                data-testid="sheet-backdrop"
                aria-hidden="true"
                onClick={onClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={handleKeyDown}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                drag="y"
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.05, bottom: 0.8 }}
                onDragEnd={(_, info) => {
                    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
                }}
                className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[30px] border-t border-iron-line bg-iron-2 bg-[radial-gradient(80%_45%_at_50%_0%,rgba(255,150,50,0.16),transparent_70%)] text-dough"
            >
                <button
                    ref={closeRef}
                    type="button"
                    aria-label="닫기"
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 flex size-10 items-center justify-center rounded-full border border-iron-line bg-iron text-dough transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
                >
                    <CloseIcon className="size-5" />
                </button>

                <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
                    {/* 손잡이 + 사진 영역이 끌어내리기 손잡이 */}
                    <div className="touch-none pt-2.5" onPointerDown={(event) => dragControls.start(event)}>
                        <span aria-hidden="true" className="mx-auto block h-1.5 w-11 rounded-full bg-iron-line" />
                        <div className="relative flex h-52 items-center justify-center">
                            {/* 갓 구운 호떡에서 오르는 김(장식) */}
                            <span aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 z-10 flex -translate-x-1/2 gap-5">
                                {[0, 1, 2].map((index) => (
                                    <span
                                        key={index}
                                        className="h-16 w-3 rounded-full bg-white/35 blur-[6px] motion-safe:animate-steam"
                                        style={{ animationDelay: `${index * -1.1}s` }}
                                    />
                                ))}
                            </span>
                            <motion.span
                                layoutId={props.imageLayoutId}
                                data-fly-source=""
                                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                                className="relative block size-44 overflow-hidden rounded-full shadow-[0_24px_50px_rgba(0,0,0,0.6),0_0_60px_rgba(255,150,50,0.25)]"
                            >
                                <MenuThumbnail imageUrl={imageUrl} className="size-full" />
                            </motion.span>
                        </div>
                    </div>
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 26 }}>
                        <h2 id={titleId} className="font-display text-[30px] leading-tight text-dough">
                            {name}
                        </h2>
                        <p className="font-num mt-1.5 text-2xl text-syrup">{formatWon(price)}</p>
                        {description && <p className="mt-2 text-sm leading-relaxed text-dough-dim">{description}</p>}
                    </motion.div>

                    {props.groups.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.16, type: "spring", stiffness: 300, damping: 26 }}
                            className="mt-6"
                        >
                            <OptionSelector groups={props.groups} selectedIds={props.selectedIds} onToggle={props.onToggleOption} />
                        </motion.div>
                    )}

                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.22, type: "spring", stiffness: 300, damping: 26 }}
                        className="mt-6 flex items-center justify-between"
                    >
                        <p className="font-display text-lg text-dough">수량</p>
                        <QuantityStepper value={props.quantity} max={props.maxQuantity} onChange={props.onQuantityChange} />
                    </motion.div>
                </div>

                <div className="shrink-0 border-t border-iron-line bg-iron/80 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
                    {/* 담을 구성: 고른 옵션의 가격표가 날아와 쌓인다 */}
                    <div aria-hidden="true" className="no-scrollbar mb-3 flex min-h-8 items-center gap-1.5 overflow-x-auto">
                        <span className="shrink-0 text-xs text-dough-dim">담을 구성</span>
                        <span className="font-num shrink-0 rounded-full bg-iron-3 px-2.5 py-1 text-xs text-dough">기본 {formatWon(price)}</span>
                        <AnimatePresence initial={false}>
                            {chosen.map((option) => (
                                <motion.span
                                    key={option.id}
                                    layoutId={`option-tag-${option.id}`}
                                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                    className="font-num flex shrink-0 items-center gap-1 rounded-full bg-syrup px-2.5 py-1 text-xs whitespace-nowrap text-molasses"
                                >
                                    {option.name} {formatOptionPrice(option.extraPrice)}
                                </motion.span>
                            ))}
                        </AnimatePresence>
                    </div>
                    <AnimatePresence initial={false}>
                        {props.message && (
                            <motion.p
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-2 text-center text-sm font-bold text-chili"
                            >
                                {props.message}
                            </motion.p>
                        )}
                    </AnimatePresence>
                    <button type="button" disabled={!props.canAdd} onClick={props.onAdd} className={props.canAdd ? CTA_ENABLED : CTA_DISABLED}>
                        <CartIcon className="size-5" />
                        <span>담기</span>
                        <span className="font-num relative ml-auto">
                            {/* 금액이 바뀔 때마다 숫자 뒤가 시럽빛으로 번쩍(숫자는 그대로 굴러간다) */}
                            <span key={props.total} aria-hidden="true" className="heat-pulse pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-lg" />
                            <RollingNumber value={formatWon(props.total)} />
                        </span>
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
