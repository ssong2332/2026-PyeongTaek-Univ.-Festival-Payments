"use client";

import type { PaymentMethod } from "@/domain/order/status";
import type { OrderStatusItemDto } from "@/lib/dto/order";
import { formatWon } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/locale";

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
  const locale = useLocale();
  const t = useT();
  return (
    <section aria-labelledby="order-items-heading" className="iron-card rounded-3xl p-5">
      <h2 id="order-items-heading" className="text-xs font-semibold tracking-[0.2em] text-dough">
        {t("order.items")}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item, index) => (
          // 항목에 ID가 없고, 주문 시점 스냅샷이라 순서가 바뀌지 않는다.
          <li key={index} className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-dough">
                {item.name} <span className="font-normal text-dough-dim">× {item.quantity}</span>
              </p>
              {item.options.length > 0 && <p className="text-sm text-dough">{item.options.join(", ")}</p>}
            </div>
            <p className="shrink-0 font-bold text-dough">{formatWon(item.lineTotal, locale)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-4 flex flex-col gap-2 border-t border-iron-line pt-4">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-dough-dim">{t("payment.title")}</dt>
          <dd className="font-semibold text-dough">{t(`payment.${paymentMethod}` as const)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-dough-dim">{t("common.total")}</dt>
          <dd className="font-display text-3xl text-dough">{formatWon(totalAmount, locale)}</dd>
        </div>
      </dl>
    </section>
  );
}
