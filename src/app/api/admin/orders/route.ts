import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { listAdminOrders } from "@/services/adminOrderService";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import type { OrderStatus } from "@/domain/order/status";
import { ORDER_STATUSES } from "@/domain/order/status";

export const dynamic = "force-dynamic";

export const GET = withHandler(
    async (request?: NextRequest) => {
        const repository = new SupabaseAdminOrderRepository();

        let date: string | undefined;
        let statusList: OrderStatus[] | undefined;
        let pickupNumber: number | undefined;

        if (request) {
            const url = new URL(request.url);
            date = url.searchParams.get("date") ?? undefined;
            const statusParam = url.searchParams.get("status");
            if (statusParam) {
                statusList = statusParam
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s): s is OrderStatus => ORDER_STATUSES.includes(s as OrderStatus));
            }
            const pickupParam = url.searchParams.get("pickupNumber");
            if (pickupParam && !isNaN(Number(pickupParam))) {
                pickupNumber = Number(pickupParam);
            }
        }

        const response = await listAdminOrders(repository, {
            date,
            status: statusList,
            pickupNumber,
        });

        return NextResponse.json(response, { status: 200 });
    },
    { route: "/api/admin/orders" },
);
