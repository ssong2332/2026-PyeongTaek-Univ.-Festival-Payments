import { NextResponse } from "next/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { withHandler } from "@/lib/api/handler";
import { requestCancel } from "@/services/orderService";

// Architecture "POST /api/orders/{token}/cancel-request" (T-35, F-45). 본문 없음.
// 200 { cancelRequestedAt } — 이미 요청됨이면 기존 시각 그대로(멱등). 조리중 이후·거절됨 409, 토큰 불일치 404.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return withHandler(async () => {
    const { token } = await params;
    const result = await requestCancel(token, {
      orderRepository: createSupabaseOrderRepository(createServiceClient()),
    });
    return NextResponse.json(result, { status: 200 });
  }, { route: "/api/orders/[token]/cancel-request" })();
}
