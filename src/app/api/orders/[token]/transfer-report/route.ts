import { NextResponse } from "next/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { withHandler } from "@/lib/api/handler";
import { reportTransfer } from "@/services/transferReportService";

// Architecture "POST /api/orders/{token}/transfer-report" (T-32, F-43). 본문 없음.
// 200 { transferReportedAt } — 이미 신고됨이면 기존 시각 그대로(멱등). 현금·결제대기 아님 409, 토큰 불일치 404.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return withHandler(async () => {
    const { token } = await params;
    const result = await reportTransfer(token, {
      orderRepository: createSupabaseOrderRepository(createServiceClient()),
      clock: { now: () => new Date() },
    });
    return NextResponse.json(result, { status: 200 });
  }, { route: "/api/orders/[token]/transfer-report" })();
}
