import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { parseUuidParam } from "@/lib/api/params";
import { SupabaseStaffCallRepository } from "@/infra/repositories/staffCallRepository";
import { acknowledgeStaffCall } from "@/services/staffCallService";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, no-store";

export const POST = withHandler(
  async (
    _request: NextRequest | undefined,
    context?: { params: Promise<{ id: string }> },
  ) => {
    const adminUser = await requireAdmin();
    const params = await context?.params;
    const id = parseUuidParam(params?.id);

    const client = createServiceClient();
    const repository = new SupabaseStaffCallRepository(client);

    const updated = await acknowledgeStaffCall(repository, id, adminUser.id);

    return NextResponse.json(updated, {
      status: 200,
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  },
  { route: "/api/admin/staff-calls/[id]/acknowledge" },
);
