import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseStaffCallRepository } from "@/infra/repositories/staffCallRepository";
import { callStaff } from "@/services/staffCallService";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, no-store";

export const POST = withHandler(
  async (
    _request?: NextRequest,
    context?: { params: Promise<{ token: string }> },
  ) => {
    const params = await context?.params;
    const token = params?.token;
    if (!token) {
      throw new AppError("NOT_FOUND", 404);
    }

    const client = createServiceClient();
    const orderRepository = createSupabaseOrderRepository(client);
    const staffCallRepository = new SupabaseStaffCallRepository(client);

    const result = await callStaff(
      { staffCallRepository, orderRepository },
      token,
    );

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  },
  { route: "/api/orders/[token]/call-staff" },
);
