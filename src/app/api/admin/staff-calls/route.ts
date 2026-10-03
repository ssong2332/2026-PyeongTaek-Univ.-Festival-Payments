import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { SupabaseStaffCallRepository } from "@/infra/repositories/staffCallRepository";
import { getStaffCalls } from "@/services/staffCallService";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, no-store";

export const GET = withHandler(
  async (request?: NextRequest) => {
    await requireAdmin();

    const searchParams = request ? new URL(request.url).searchParams : undefined;
    const unacknowledgedOnly = searchParams?.get("unacknowledgedOnly") === "true";

    const client = createServiceClient();
    const repository = new SupabaseStaffCallRepository(client);

    const result = await getStaffCalls(repository, { unacknowledgedOnly });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  },
  { route: "/api/admin/staff-calls" },
);
