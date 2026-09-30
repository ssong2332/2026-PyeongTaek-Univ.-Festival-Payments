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
    <header className="bg-linear-to-br from-[#8B3A1E] to-[#D08A35] px-5 pt-6 pb-8 text-white">
      <h1 className="sr-only">주문 현황</h1>
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
          <span className="inline-flex items-center rounded-full bg-[#8B3A1E]/90 px-4 py-2 text-sm font-semibold">
            {aheadCount > 0 ? `내 앞 대기 ${aheadCount}건` : "대기 없음"}
          </span>
        )}
      </div>
    </header>
  );
}
