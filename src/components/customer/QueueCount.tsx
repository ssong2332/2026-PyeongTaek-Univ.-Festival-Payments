"use client";

import { RollingNumber } from "@/components/motion/RollingNumber";
import { useT } from "@/lib/i18n/locale";

// F-11 메뉴판: 전체 미완료 주문 수. 0건이면 "대기 없음". 숫자는 굴러서 바뀐다.
export function QueueCount({ waitingCount }: { waitingCount: number | null }) {
    const t = useT();
    let detail = t("queue.checking");
    if (waitingCount === 0) detail = t("queue.none");
    else if (waitingCount !== null) detail = t("queue.count", { count: waitingCount });

    return (
        <section aria-label={t("queue.title")} className="iron-card flex items-center gap-3 rounded-2xl px-4 py-3.5">
            <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${waitingCount === 0 ? "pulse-ok bg-ok" : "pulse-dot bg-syrup"}`}
            />
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
