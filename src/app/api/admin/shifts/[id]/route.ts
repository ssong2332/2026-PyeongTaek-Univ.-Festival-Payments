import { NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseShiftRepository } from "@/infra/repositories/supabaseShiftRepository";
import { AppError } from "@/lib/api/errors";
import { parseUuidParam } from "@/lib/api/params";
import { withHandler } from "@/lib/api/handler";
import { saveShift, deleteShift } from "@/services/shiftService";

type Context = { params: Promise<{ id: string }> };
export const PATCH = withHandler(async (request: Request, context: Context) => {
  await requireAdmin();
  const id = parseUuidParam((await context.params).id);
  const input = await request.json().catch(() => { throw new AppError("VALIDATION_ERROR", 400); });
  const shift = await saveShift(createSupabaseShiftRepository(createServiceClient()), input, id);
  return NextResponse.json(shift);
}, { route: "/api/admin/shifts/[id]" });

export const DELETE = withHandler(async (_request: Request, context: Context) => {
  await requireAdmin();
  const id = parseUuidParam((await context.params).id);
  await deleteShift(createSupabaseShiftRepository(createServiceClient()), id);
  return new Response(null, { status: 204 });
}, { route: "/api/admin/shifts/[id]" });
