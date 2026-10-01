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

export function CartSummary({ lines, onQuantityChange, onRemove }: CartSummaryProps) {
    return (
        <ul className="flex flex-col gap-3">
            {lines.map((line) => (
                <li
                    key={line.lineId}
                    className={`rounded-[20px] border bg-white p-3 shadow-sm ${line.warning ? "border-red-300" : "border-orange-100"}`}
                >
                    <div className="flex gap-3">
                        <MenuThumbnail imageUrl={line.imageUrl} />
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex items-start gap-2">
                                <p className="min-w-0 flex-1 truncate text-base font-bold text-neutral-900">{line.name}</p>
                                <button
                                    type="button"
                                    aria-label={`${line.name} 삭제`}
                                    onClick={() => onRemove(line.lineId)}
                                    className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-full text-stone-500 focus-visible:outline-2 focus-visible:outline-brand"
                                >
                                    <CloseIcon className="size-4" />
                                </button>
                            </div>
                            {line.optionSummary && <p className="text-xs font-bold text-orange-700">{line.optionSummary}</p>}
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <QuantityStepper
                                    size="sm"
                                    label={`${line.name} 수량`}
                                    value={line.quantity}
                                    max={line.maxQuantity}
                                    onChange={(quantity) => onQuantityChange(line.lineId, quantity)}
                                />
                                <p className="text-lg font-extrabold text-brand-deep">{formatWon(line.lineTotal)}</p>
                            </div>
                        </div>
                    </div>
                    {line.warning && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{line.warning}</p>}
                </li>
            ))}
        </ul>
    );
}
