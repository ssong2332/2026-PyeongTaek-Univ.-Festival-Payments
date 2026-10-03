import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { formatPickupNumber } from "./PickupNumberDisplay";

export interface MyOrderLink {
    statusToken: string;
    pickupNumber: number;
}

// #89 메뉴판 "내 주문 현황 보기": 이 기기에서 한 주문의 상태 페이지 링크(받은 순서 = 최신순). 없으면 아무것도 그리지 않는다.
// 글자는 brand-deep on orange-50(약 7.3:1), 제목은 neutral-900 on white.
export function MyOrderLinks({ orders }: { orders: readonly MyOrderLink[] }) {
    if (orders.length === 0) return null;

    return (
        <section aria-labelledby="my-orders-title" className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
            <h2 id="my-orders-title" className="text-sm font-bold text-neutral-900">
                내 주문 현황 보기
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
                {orders.map((order) => {
                    const digits = formatPickupNumber(order.pickupNumber);
                    return (
                        <li key={order.statusToken}>
                            <Link
                                href={`/orders/${order.statusToken}`}
                                aria-label={`픽업 번호 ${digits} 주문 현황 보기`}
                                className="flex min-h-12 items-center gap-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
                            >
                                <span className="text-xs font-bold">픽업 번호</span>
                                <span className="text-xl font-extrabold tabular-nums">{digits}</span>
                                <ArrowRightIcon className="ml-auto size-5" />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
