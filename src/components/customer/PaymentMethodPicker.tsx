import { BankIcon, CashIcon } from "@/components/ui/icons";
import type { PaymentMethod } from "@/domain/order/status";

const METHODS: { value: PaymentMethod; label: string; Icon: typeof CashIcon }[] = [
    { value: "cash", label: "현금", Icon: CashIcon },
    { value: "transfer", label: "계좌이체", Icon: BankIcon },
];

export interface PaymentMethodPickerProps {
    value: PaymentMethod | null;
    onChange: (method: PaymentMethod) => void;
    // 지금 받는 결제수단. 여기에 없는 것은 "(준비 중)"으로 비활성 표시한다.
    enabledMethods: readonly PaymentMethod[];
    disabled?: boolean;
}

// F-06: 현금 / 계좌이체 중 하나. 계좌이체 안내 블록(T-31)은 주문 완료 화면 몫이다.
export function PaymentMethodPicker({ value, onChange, enabledMethods, disabled = false }: PaymentMethodPickerProps) {
    return (
        <section className="rounded-[20px] border border-line bg-white p-4">
            <h2 id="payment-method-title" className="mb-3 text-xs font-bold tracking-widest text-orange-700">
                결제 방법
            </h2>
            <div role="radiogroup" aria-labelledby="payment-method-title" className="grid grid-cols-2 gap-3">
                {METHODS.map(({ value: method, label, Icon }) => {
                    const checked = value === method;
                    const available = enabledMethods.includes(method);
                    const inactive = disabled || !available;
                    return (
                        <label
                            key={method}
                            className={`flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 text-base font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                                checked ? "border-brand-amber bg-peach text-brand-deep" : "border-stone-200 bg-white text-stone-600"
                            } ${inactive ? "cursor-not-allowed opacity-60" : ""}`}
                        >
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
                            <Icon className="size-5" />
                            {label}
                            {!available && (
                                <>
                                    {" "}
                                    <span className="text-xs font-medium">(준비 중)</span>
                                </>
                            )}
                        </label>
                    );
                })}
            </div>
            {value === "cash" && (
                <p className="mt-3 rounded-2xl border border-badge bg-peach px-4 py-3 text-sm font-bold text-brand-deep">
                    부스에서 현금으로 결제해 주세요.
                </p>
            )}
        </section>
    );
}
