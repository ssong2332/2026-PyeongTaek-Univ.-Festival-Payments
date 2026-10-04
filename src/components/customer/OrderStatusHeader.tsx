import { HotteokMascot } from "@/components/ui/HotteokMascot";
import type { OrderStatus } from "@/domain/order/status";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PickupNumberDisplay } from "./PickupNumberDisplay";

// 캡처 12 헤더. aheadCount가 null이면 대기 알약을 숨긴다(종료 상태). 알약 배경은 대비 때문에 거의 불투명.
export function OrderStatusHeader({
  pickupNumber,
  status,
  aheadCount,
  onBack,
}: {
  pickupNumber: number;
  status: OrderStatus;
  aheadCount: number | null;
  onBack?: () => void;
}) {
  return (
    <header className="relative overflow-hidden rounded-b-[28px] bg-linear-to-br from-brand-deep to-brand-amber px-5 pt-6 pb-8 text-white shadow-[0_16px_40px_rgba(103,55,35,0.16)]">
      <span aria-hidden="true" className="absolute -top-20 -right-20 size-52 rounded-full bg-white/8" />
      <HotteokMascot variant="wave" size={76} motion="bob" className="absolute top-8 right-5" />
      <h1 className="sr-only">주문 현황</h1>
      {/* 장식(원·마스코트)보다 글씨가 위에 오도록 relative로 쌓는다 */}
      <div className="relative">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 flex items-center gap-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span aria-hidden="true">‹</span> 뒤로
          </button>
        )}
        <PickupNumberDisplay pickupNumber={pickupNumber} variant="header" />
        <div aria-live="polite" className="mt-5 flex flex-wrap gap-2">
          <OrderStatusBadge status={status} />
          {aheadCount !== null && (
            <span className="inline-flex items-center rounded-full bg-brand-deep/90 px-4 py-2 text-sm font-semibold">
              {aheadCount > 0 ? `내 앞 대기 ${aheadCount}건` : "대기 없음"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
