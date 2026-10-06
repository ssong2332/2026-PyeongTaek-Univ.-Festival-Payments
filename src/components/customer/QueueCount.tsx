"use client";

import { RollingNumber } from "@/components/motion/RollingNumber";
import { ArtIcon } from "@/components/ui/ArtIcon";
import { useT } from "@/lib/i18n/locale";

// F-11 메뉴판: 전체 미완료 주문 수. 0건이면 "대기 없음". 숫자는 굴러서 바뀐다.
export function QueueCount({ waitingCount }: { waitingCount: number | null }) {
    const t = useT();
    let detail = t("queue.checking");
    if (waitingCount === 0) detail = t("queue.none");
    else if (waitingCount !== null) detail = t("queue.count", { count: waitingCount });

    return (
        <section aria-label={t("queue.title")} className="iron-card flex items-center gap-3 rounded-2xl px-4 py-3.5">
            {/* 대기가 있으면 모래시계가 주기적으로 뒤집히고, 없으면 종이 흔들린다 */}
            <span aria-hidden="true" className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-syrup/12">
                <ArtIcon name={waitingCount === 0 ? "bell" : "hourglass"} size={30} motion={waitingCount === 0 ? "ring" : "flip"} />
                <span className={`absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-iron-2 ${waitingCount === 0 ? "pulse-ok bg-ok" : "pulse-dot bg-syrup"}`} />
            </span>
            <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-dough">{t("queue.title")}</span>
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
