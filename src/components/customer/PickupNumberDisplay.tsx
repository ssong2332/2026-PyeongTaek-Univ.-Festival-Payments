// 부스에서 부르는 번호 그대로 보이게 3자리로 0을 채우고(5 → 005), 천 단위 쉼표는 넣지 않는다.
function formatPickupNumber(pickupNumber: number): string {
  return String(pickupNumber).padStart(3, "0");
}

// tile: 주문 완료 보기의 큰 타일 / header: 주문 현황 보기의 갈색 헤더 안
export function PickupNumberDisplay({
  pickupNumber,
  variant = "tile",
}: {
  pickupNumber: number;
  variant?: "tile" | "header";
}) {
  const digits = formatPickupNumber(pickupNumber);

  if (variant === "header") {
    return (
      <section aria-label="픽업 번호" className="flex flex-col gap-1 text-white">
        <p className="text-xs font-semibold tracking-[0.3em]">픽업 번호</p>
        <p className="text-6xl font-black leading-none tabular-nums">{digits}</p>
      </section>
    );
  }

  return (
    <section aria-label="픽업 번호" className="flex justify-center">
      <p className="flex h-32 min-w-48 items-center justify-center rounded-3xl bg-linear-to-br from-brand-deep to-brand-amber px-8 text-6xl font-black tabular-nums text-white shadow-lg shadow-brand-deep/30">
        {digits}
      </p>
    </section>
  );
}
