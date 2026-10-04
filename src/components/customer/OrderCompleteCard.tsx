import { HotteokMascot } from "@/components/ui/HotteokMascot";
import type { PaymentMethod } from "@/domain/order/status";
import { PickupNumberDisplay } from "./PickupNumberDisplay";
import { formatWon } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "./orderDisplay";

// 캡처 11. 접수 카드는 작은 흰 글씨가 오른쪽 끝까지 가므로 그라데이션을 #B4432A(흰 글씨 5.6:1)에서 멈춰 대비 4.5:1 이상을 지킨다.
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
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-deep to-[#B4432A] p-6 text-white shadow-[0_16px_36px_rgba(90,48,37,0.22)]">
        <span aria-hidden="true" className="absolute -top-16 -right-16 size-44 rounded-full bg-white/8" />
        <div className="relative flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/15">
            <HotteokMascot variant="chef" size={46} motion="bob" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.2em]">ORDER COMPLETE</p>
            <h1 className="text-2xl font-bold">주문이 접수됐어요!</h1>
          </div>
        </div>
        <p className="relative mt-4 text-sm">결제가 확인되면 맛있게 구워드릴게요.</p>
      </section>

      <section aria-labelledby="pickup-guide" className="rounded-3xl border border-line bg-white">
        <div className="border-b border-dashed border-line px-5 py-4">
          <p className="text-xs font-bold tracking-[0.2em] text-neutral-500">PICKUP NUMBER</p>
          <h2 id="pickup-guide" className="mt-1 text-sm font-semibold text-neutral-900">
            수령할 때 이 번호를 보여주세요
          </h2>
        </div>
        <div className="flex flex-col items-center gap-3 px-5 py-6">
          <PickupNumberDisplay pickupNumber={pickupNumber} />
          <p className="text-xl font-bold text-brand-deep">{formatWon(totalAmount)}</p>
        </div>
        <dl className="border-t border-line px-5 py-4">
          <dt className="text-xs text-neutral-500">결제 방법</dt>
          <dd className="mt-1 font-bold text-neutral-900">{PAYMENT_METHOD_LABELS[paymentMethod]}</dd>
        </dl>
      </section>
    </>
  );
}
