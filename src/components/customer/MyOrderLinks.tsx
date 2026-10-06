"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING } from "@/components/motion/presets";
import { ArrowRightIcon } from "@/components/ui/icons";
import { formatPickupNumber } from "./PickupNumberDisplay";
import { useT } from "@/lib/i18n/locale";

export interface MyOrderLink {
    statusToken: string;
    pickupNumber: number;
}

// #89 메뉴판 "내 주문 현황 보기": 이 기기에서 한 주문의 상태 페이지 링크(받은 순서 = 최신순). 없으면 아무것도 그리지 않는다.
export function MyOrderLinks({ orders }: { orders: readonly MyOrderLink[] }) {
    const t = useT();
    if (orders.length === 0) return null;

    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            aria-labelledby="my-orders-title"
            className="glow-border rounded-2xl border border-syrup/25 bg-iron-2 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,181,71,0.16),transparent_60%)] px-4 py-3.5"
        >
            <h2 id="my-orders-title" className="flex items-center gap-2 text-sm font-bold text-syrup">
                <span className="pulse-dot size-2 rounded-full bg-syrup" />
                {t("myOrders.title")}
            </h2>
            <ul className="mt-2.5 flex flex-col gap-2">
                {orders.map((order) => {
                    const digits = formatPickupNumber(order.pickupNumber);
                    return (
                        <li key={order.statusToken}>
                            <Link
                                href={`/orders/${order.statusToken}`}
                                aria-label={t("myOrders.linkLabel", { number: digits })}
                                className="group flex min-h-12 items-center gap-3 rounded-xl border border-iron-line bg-iron/60 px-3 py-2 transition-colors hover:border-syrup/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
                            >
                                <span className="text-xs text-dough-dim">{t("pickup.label")}</span>
                                <span className="font-num text-xl text-dough">{digits}</span>
                                <ArrowRightIcon className="ml-auto size-5 text-syrup transition-transform group-hover:translate-x-1" />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </motion.section>
    );
}
