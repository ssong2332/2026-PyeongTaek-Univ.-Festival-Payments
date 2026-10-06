import { RollingNumber } from "@/components/motion/RollingNumber";

// F-11 메뉴판: 전체 미완료 주문 수. 0건이면 "대기 없음". 숫자는 굴러서 바뀐다.
export function QueueCount({ waitingCount }: { waitingCount: number | null }) {
    let detail = "확인 중";
    if (waitingCount === 0) detail = "대기 없음";
    else if (waitingCount !== null) detail = `${waitingCount}건이 처리 중입니다`;

    return (
        <section aria-label="현재 처리 중인 주문" className="iron-card flex items-center gap-3 rounded-2xl px-4 py-3.5">
            <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${waitingCount === 0 ? "pulse-ok bg-ok" : "pulse-dot bg-syrup"}`}
            />
            <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-dough">현재 처리 중인 주문</span>
                <span className="text-xs text-dough-dim">{detail}</span>
            </span>
            {waitingCount !== null && (
                <span aria-hidden="true" className="font-num relative flex items-baseline gap-0.5 text-3xl text-dough">
                    <span key={waitingCount} className="heat-pulse pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-lg" />
                    <RollingNumber value={String(waitingCount)} />
                </span>
            )}
        </section>
    );
}
