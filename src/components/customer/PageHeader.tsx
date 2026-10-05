"use client";

import { motion } from "motion/react";
import { FESTIVAL_ART } from "@/features/festival/festivalArt";

// 장바구니·결제 화면 머리(뒤로 + 제목). 뒤로 링크는 화면(app)이 만들어 넘긴다 — 이 컴포넌트는 라우터를 모른다.
// 축제가 시작되면(14시~) 머리 위쪽에 전구 줄(Flaticon 그림)이 걸려 살랑이며 반짝인다 — 머리 안쪽 뒤에 두어 아래 본문을 가리지 않는다.
export const BACK_LINK_CLASS =
    "iron-card flex size-11 shrink-0 items-center justify-center rounded-2xl text-dough transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-syrup";

export function PageHeader({ title, back, right }: { title: string; back: React.ReactNode; right?: React.ReactNode }) {
    return (
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-iron-line/70 bg-iron/80 px-4 py-3 backdrop-blur-xl">
            {back}
            <motion.h1
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                className="font-display flex-1 text-2xl text-dough"
            >
                {title}
            </motion.h1>
            {right}
            <span
                aria-hidden="true"
                className="fest-fx-item pointer-events-none absolute inset-x-0 top-0 -z-10 h-7 origin-top"
                style={{ "--th": 0.05 } as React.CSSProperties}
            >
                <span className="fest-lights fest-swing fest-twinkle block size-full" style={{ "--src": `url(${FESTIVAL_ART.lightsBulbs})` } as React.CSSProperties} />
            </span>
        </header>
    );
}
