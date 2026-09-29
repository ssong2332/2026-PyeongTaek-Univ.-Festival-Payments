import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { getOrderByToken } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export const GET = withHandler(
  async (
    _request?: NextRequest,
    context?: { params: Promise<{ token: string }> },
  ) => {
    const params = await context?.params;
    const token = params?.token;
    if (!token) {
      throw new AppError("NOT_FOUND", 404);
    }

    const orderRepository = createSupabaseOrderRepository(createServiceClient());
    const order = await getOrderByToken(token, { orderRepository });

    return NextResponse.json(order, { status: 200 });
  },
  { route: "/api/orders/[token]" },
);
