import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { listAdminOrders, listKitchenOrders } from "@/services/adminOrderService";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { requireAdmin } from "@/infra/supabase/session";
import type { OrderStatus } from "@/domain/order/status";
import { ORDER_STATUSES } from "@/domain/order/status";
import { parseKstDateParam } from "@/lib/api/params";
import { AppError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export const GET = withHandler(
    async (request?: NextRequest) => {
        await requireAdmin();
        const repository = new SupabaseAdminOrderRepository();

        let date: string | undefined;
        let statusList: OrderStatus[] | undefined;
        let pickupNumber: number | undefined;

        if (request) {
            const url = new URL(request.url);
            // scope=kitchen: 조리 화면 전용 — 날짜 없이 조리중 주문만(다른 조건은 무시). 기존 날짜 기본값은 그대로.
            const scope = url.searchParams.get("scope");
            if (scope !== null) {
                if (scope !== "kitchen") throw new AppError("VALIDATION_ERROR", 400);
                return NextResponse.json(await listKitchenOrders(repository), { status: 200 });
            }
            // 없으면 서비스가 오늘(KST)로 채운다. 달력에 없는 날짜는 400.
            date = parseKstDateParam(url.searchParams.get("date"));
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
