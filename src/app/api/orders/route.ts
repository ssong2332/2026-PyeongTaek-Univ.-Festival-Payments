import { NextResponse } from "next/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { CreateOrderRequestSchema } from "@/lib/dto/order";
import { createOrder } from "@/services/orderService";

// Architecture "고객 주문 생성". 속도 제한(T-51)은 이후 서비스 앞단에 추가된다.
// withHandler는 요청을 넘겨주지 않으므로 요청마다 감싸서 request를 쓴다.
export async function POST(request: Request) {
  return withHandler(async () => {
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = CreateOrderRequestSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);

    const result = await createOrder(parsed.data, {
      orderRepository: createSupabaseOrderRepository(createServiceClient()),
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  }, { route: "/api/orders" })();
}
