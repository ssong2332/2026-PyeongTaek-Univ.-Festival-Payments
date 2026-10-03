import { NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseShiftRepository } from "@/infra/repositories/supabaseShiftRepository";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { listShifts, saveShift } from "@/services/shiftService";

export const dynamic = "force-dynamic";
export const GET = withHandler(async () => {
  await requireAdmin();
  const shifts = await listShifts(createSupabaseShiftRepository(createServiceClient()));
  return NextResponse.json({ shifts });
}, { route: "/api/admin/shifts" });

export const POST = withHandler(async (request: Request) => {
  await requireAdmin();
  const input = await request.json().catch(() => { throw new AppError("VALIDATION_ERROR", 400); });
  const shift = await saveShift(createSupabaseShiftRepository(createServiceClient()), input);
  return NextResponse.json(shift, { status: 201 });
}, { route: "/api/admin/shifts" });
