import { RollingNumber } from "@/components/motion/RollingNumber";
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
        <section aria-labelledby="order-summary-title" className="iron-card rounded-3xl p-4">
            <h2 id="order-summary-title" className="font-display mb-3 text-lg text-dough">
                주문 내역
            </h2>
            <ul className="flex flex-col gap-2.5">
                {lines.map((line) => (
                    <li key={line.lineId} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0">
                            <span className="text-dough">
                                {line.name} <span className="font-num text-syrup">× {line.quantity}</span>
                            </span>
                            {line.optionSummary && <span className="block text-xs text-dough-dim">{line.optionSummary}</span>}
                        </span>
                        <span className="font-num shrink-0 text-dough">{formatWon(line.lineTotal)}</span>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-dashed border-iron-line pt-3">
                <span className="text-sm text-dough-dim">합계</span>
                <span className="font-num text-2xl text-syrup">
                    <RollingNumber value={formatWon(total)} />
                </span>
            </div>
        </section>
    );
}
