import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { getQueueStatus } from "@/services/orderService";

export const dynamic = "force-dynamic";

// 메뉴판이 30초마다 다시 읽는 현재 값 — 캐시된 대기 수를 보여주지 않는다.
const CACHE_CONTROL = "no-store";

export const GET = withHandler(
  async () => {
    const orderRepository = createSupabaseOrderRepository(createServiceClient());
    const queue = await getQueueStatus({ orderRepository });

    return NextResponse.json(queue, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  },
  { route: "/api/queue" },
);
