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
export function QuantityStepper({ value, max, onChange, min = 1, label = "수량", size = "md" }: QuantityStepperProps) {
    const button = size === "md" ? "size-10" : "size-8";
    const buttonClass = `flex ${button} items-center justify-center rounded-xl bg-white text-brand-deep shadow-sm disabled:text-stone-300 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-brand`;
    return (
        <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-2xl border border-badge bg-peach p-1">
            <button type="button" aria-label="수량 줄이기" disabled={value <= min} onClick={() => onChange(value - 1)} className={buttonClass}>
                <MinusIcon className="size-4" />
            </button>
            <span aria-live="polite" className={`${size === "md" ? "w-10 text-lg" : "w-8 text-base"} text-center font-extrabold text-neutral-900`}>
                {value}
            </span>
            <button type="button" aria-label="수량 늘리기" disabled={value >= max} onClick={() => onChange(value + 1)} className={buttonClass}>
                <PlusIcon className="size-4" />
            </button>
        </div>
    );
}
