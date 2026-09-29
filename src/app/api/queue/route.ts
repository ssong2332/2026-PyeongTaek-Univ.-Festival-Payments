import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { getQueueStatus } from "@/services/orderService";

export const dynamic = "force-dynamic";

export const GET = withHandler(
  async () => {
    const orderRepository = createSupabaseOrderRepository(createServiceClient());
    const queue = await getQueueStatus({ orderRepository });

    return NextResponse.json(queue, { status: 200 });
  },
  { route: "/api/queue" },
);
