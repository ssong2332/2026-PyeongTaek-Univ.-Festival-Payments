import type { PaymentMethod } from "@/domain/order/status";
import type { OrderStatusItemDto } from "@/lib/dto/order";
import { formatWon } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "./orderDisplay";

// 주문 현황의 "주문 내역" 카드 — 금액은 서버가 계산한 주문 시점 값을 그대로 보여 준다.
export function OrderStatusItems({
  items,
  totalAmount,
  paymentMethod,
}: {
  items: OrderStatusItemDto[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
}) {
  return (
    <section aria-labelledby="order-items-heading" className="rounded-3xl border border-[#F3E7DA] bg-white p-5">
      <h2 id="order-items-heading" className="text-xs font-semibold tracking-[0.2em] text-brand-deep">
        주문 내역
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item, index) => (
          // 항목에 ID가 없고, 주문 시점 스냅샷이라 순서가 바뀌지 않는다.
          <li key={index} className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-neutral-900">
                {item.name} <span className="font-normal text-neutral-500">× {item.quantity}</span>
              </p>
              {item.options.length > 0 && <p className="text-sm text-brand-deep/80">{item.options.join(", ")}</p>}
            </div>
            <p className="shrink-0 font-bold text-brand-deep">{formatWon(item.lineTotal)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-4 flex flex-col gap-2 border-t border-[#F3E7DA] pt-4">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-neutral-500">결제 방법</dt>
          <dd className="font-semibold text-neutral-900">{PAYMENT_METHOD_LABELS[paymentMethod]}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-neutral-700">합계</dt>
          <dd className="text-2xl font-black text-brand-deep">{formatWon(totalAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}
