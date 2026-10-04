import { formatWon } from "@/lib/format";

export interface OrderSummaryLine {
    lineId: string;
    name: string;
    optionSummary: string;
    quantity: number;
    lineTotal: number;
}

// 결제 화면의 "주문 내역" 카드(읽기 전용). 금액은 표시용 — 확정 금액은 서버가 계산한다.
export function OrderSummary({ lines, total }: { lines: readonly OrderSummaryLine[]; total: number }) {
    return (
        <section aria-labelledby="order-summary-title" className="rounded-[20px] border border-line bg-white p-4">
            <h2 id="order-summary-title" className="mb-3 text-xs font-bold tracking-widest text-orange-700">
                주문 내역
            </h2>
            <ul className="flex flex-col gap-2">
                {lines.map((line) => (
                    <li key={line.lineId} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0">
                            <span className="text-neutral-800">
                                {line.name} <span className="text-orange-700">× {line.quantity}</span>
                            </span>
                            {line.optionSummary && <span className="block text-xs text-stone-500">{line.optionSummary}</span>}
                        </span>
                        <span className="shrink-0 font-bold text-brand-deep">{formatWon(line.lineTotal)}</span>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-neutral-800">합계</span>
                <span className="text-2xl font-extrabold text-brand-deep">{formatWon(total)}</span>
            </div>
        </section>
    );
}
