import type { PaymentMethod } from "@/domain/order/status";
import { PickupNumberDisplay } from "./PickupNumberDisplay";
import { formatWon } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "./orderDisplay";

// 캡처 11. 접수 카드는 작은 흰 글씨가 오른쪽 끝까지 가므로 그라데이션을 #AD6229에서 멈춰 대비 4.5:1 이상을 지킨다.
export function OrderCompleteCard({
  pickupNumber,
  totalAmount,
  paymentMethod,
}: {
  pickupNumber: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
}) {
  return (
    <>
      <section className="rounded-3xl bg-linear-to-br from-brand-deep to-[#AD6229] p-6 text-white">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/15">
            <CheckIcon />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.2em]">ORDER COMPLETE</p>
            <h1 className="text-2xl font-bold">주문이 접수됐어요!</h1>
          </div>
        </div>
        <p className="mt-4 text-sm">결제가 확인되면 맛있게 구워드릴게요.</p>
      </section>

      <section aria-labelledby="pickup-guide" className="rounded-3xl border border-[#F3E7DA] bg-white">
        <div className="border-b border-dashed border-[#F3E7DA] px-5 py-4">
          <p className="text-xs font-bold tracking-[0.2em] text-neutral-500">PICKUP NUMBER</p>
          <h2 id="pickup-guide" className="mt-1 text-sm font-semibold text-neutral-900">
            수령할 때 이 번호를 보여주세요
          </h2>
        </div>
        <div className="flex flex-col items-center gap-3 px-5 py-6">
          <PickupNumberDisplay pickupNumber={pickupNumber} />
          <p className="text-xl font-bold text-brand-deep">{formatWon(totalAmount)}</p>
        </div>
        <dl className="border-t border-[#F3E7DA] px-5 py-4">
          <dt className="text-xs text-neutral-500">결제 방법</dt>
          <dd className="mt-1 font-bold text-neutral-900">{PAYMENT_METHOD_LABELS[paymentMethod]}</dd>
        </dl>
      </section>
    </>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}
