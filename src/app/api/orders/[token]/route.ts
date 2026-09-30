import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { getOrderByToken } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

// URL의 토큰이 곧 접근 권한인 주문 정보(F-10) — 공유 캐시는 물론 브라우저에도 저장하지 않는다.
const CACHE_CONTROL = "private, no-store";

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

    return NextResponse.json(order, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  },
  { route: "/api/orders/[token]" },
);
