"use client";

import { motion } from "motion/react";
import { useT } from "@/lib/i18n/locale";

// 로딩: 원형 스피너 대신 철판 위 반죽 세 덩이가 차례로 눌려 노릇해졌다가 다시 반죽이 되는 반복 + 카드 자리표시.
export function MenuSkeleton({ count = 3 }: { count?: number }) {
    const t = useT();
    return (
        <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">{t("menu.loading")}</span>
            <div aria-hidden="true" className="flex items-end justify-center gap-4 py-5">
                {[0, 1, 2].map((index) => (
                    <motion.span
                        key={index}
                        className="block size-11 rounded-full"
                        style={{ originY: 1 }}
                        animate={{
                            scaleY: [1, 1, 0.55, 0.55, 1],
                            scaleX: [1, 1, 1.35, 1.35, 1],
                            backgroundColor: ["#f7e8d0", "#f7e8d0", "#e9a94f", "#c97a2b", "#f7e8d0"],
                            boxShadow: [
                                "0 0 0 rgba(255,181,71,0)",
                                "0 0 0 rgba(255,181,71,0)",
                                "0 0 18px rgba(255,181,71,0.6)",
                                "0 0 12px rgba(255,181,71,0.4)",
                                "0 0 0 rgba(255,181,71,0)",
                            ],
                        }}
                        transition={{ duration: 1.8, repeat: Infinity, delay: index * 0.22, times: [0, 0.2, 0.35, 0.8, 1], ease: "easeInOut" }}
                    />
                ))}
            </div>
            <p aria-hidden="true" className="-mt-2 text-center text-xs text-dough-dim">
                {t("menu.loadingFlavor")}
            </p>
            {Array.from({ length: count }, (_, index) => (
                <div key={index} aria-hidden="true" className="iron-card grid grid-cols-[96px_1fr] items-center gap-3.5 rounded-3xl py-3 pr-4 pl-3">
                    <div className="size-24 rounded-full bg-iron-line/60 motion-safe:animate-pulse" />
                    <div className="flex flex-col gap-2">
                        <div className="h-4 w-2/5 rounded-full bg-iron-line motion-safe:animate-pulse" />
                        <div className="h-3 w-4/5 rounded-full bg-iron-line/70 motion-safe:animate-pulse" />
                        <div className="mt-1 h-4 w-1/4 rounded-full bg-iron-line motion-safe:animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}
