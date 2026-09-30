import { ClockIcon } from "@/components/ui/icons";

// F-11 메뉴판: 전체 미완료 주문 수. 0건이면 "대기 없음".
export function QueueCount({ waitingCount }: { waitingCount: number | null }) {
    let detail = "확인 중";
    if (waitingCount === 0) detail = "대기 없음";
    else if (waitingCount !== null) detail = `${waitingCount}건이 처리 중입니다`;

    return (
        <section aria-label="현재 처리 중인 주문" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-amber text-white">
                <ClockIcon />
            </span>
            <span className="flex flex-1 flex-col">
                <span className="text-sm font-bold text-neutral-900">현재 처리 중인 주문</span>
                <span className="text-xs text-stone-500">{detail}</span>
            </span>
            <span className="text-2xl font-extrabold text-brand-deep" aria-hidden="true">
                {waitingCount ?? "-"}
            </span>
        </section>
    );
}
