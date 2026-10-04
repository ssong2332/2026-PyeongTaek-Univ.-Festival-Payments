"use client";

import { useEffect, useId, useRef } from "react";
import { CTA_DISABLED, CTA_ENABLED } from "@/components/ui/cta";
import { CartIcon, CloseIcon } from "@/components/ui/icons";
import { formatWon } from "@/lib/format";
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
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

// Architecture 8절: 메뉴판(/) 위의 모달(라우트 없음).
export function MenuDetailSheet(props: MenuDetailSheetProps) {
    const { name, description, price, imageUrl, onClose } = props;
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

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
            <div data-testid="sheet-backdrop" aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={handleKeyDown}
                className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-cream shadow-xl"
            >
                <button
                    ref={closeRef}
                    type="button"
                    aria-label="닫기"
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-black/45 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                    <CloseIcon className="size-5" />
                </button>

                <div className="flex-1 overflow-y-auto pb-5">
                    <MenuThumbnail imageUrl={imageUrl} className="h-40 w-full" />
                    <div className="flex items-start justify-between gap-3 px-5 pt-4">
                        <h2 id={titleId} className="text-xl font-extrabold text-neutral-900">
                            {name}
                        </h2>
                        <p className="shrink-0 text-xl font-extrabold text-brand-deep">{formatWon(price)}</p>
                    </div>
                    {description && <p className="mt-2 px-5 text-sm text-stone-600">{description}</p>}
                    {props.groups.length > 0 && (
                        <div className="mt-5 px-5">
                            <OptionSelector groups={props.groups} selectedIds={props.selectedIds} onToggle={props.onToggleOption} />
                        </div>
                    )}
                    <div className="mt-5 px-5">
                        <p className="mb-2 text-sm font-bold text-orange-700">수량</p>
                        <QuantityStepper value={props.quantity} max={props.maxQuantity} onChange={props.onQuantityChange} />
                    </div>
                </div>

                <div className="shrink-0 border-t border-line bg-cream px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {props.message && <p className="mb-2 text-center text-sm font-bold text-brand-deep">{props.message}</p>}
                    <button type="button" disabled={!props.canAdd} onClick={props.onAdd} className={props.canAdd ? CTA_ENABLED : CTA_DISABLED}>
                        <CartIcon className="size-5" />
                        <span>담기</span>
                        <span className="ml-auto">{formatWon(props.total)}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
