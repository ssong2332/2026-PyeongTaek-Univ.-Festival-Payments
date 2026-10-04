import { NextResponse } from "next/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createSupabaseRateLimitRepository } from "@/infra/repositories/supabaseRateLimitRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { getClientRateLimitKey } from "@/lib/api/clientIp";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { CreateOrderRequestSchema } from "@/lib/dto/order";
import { createOrder } from "@/services/orderService";

// Architecture "고객 주문 생성" (T-07, T-08, T-51).
// withHandler는 요청을 넘겨주지 않으므로 요청마다 감싸서 request를 쓴다.
export async function POST(request: Request) {
  return withHandler(async () => {
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = CreateOrderRequestSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);

    const client = createServiceClient();
    const clientKey = getClientRateLimitKey(request);

    const result = await createOrder(parsed.data, {
      orderRepository: createSupabaseOrderRepository(client),
      rateLimitRepository: createSupabaseRateLimitRepository(client),
      clientKey,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  }, { route: "/api/orders" })();
}
