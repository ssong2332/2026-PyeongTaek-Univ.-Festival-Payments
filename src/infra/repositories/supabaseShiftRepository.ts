import type { SupabaseClient } from "@supabase/supabase-js";
import type { Shift, ShiftInput } from "@/domain/shift/schedule";
import { ShiftSchema } from "@/lib/dto/shift";
import { AppError } from "@/lib/api/errors";
import type { ShiftRepository } from "@/services/ports";

const columns = "id, person_name, date, starts_at, ends_at, role";
interface ShiftRow { id: string; person_name: string; date: string; starts_at: string; ends_at: string; role: string }
function toShift(row: ShiftRow): Shift {
  return ShiftSchema.parse({
    id: row.id, personName: row.person_name, date: row.date,
    startsAt: row.starts_at.slice(0, 5), endsAt: row.ends_at.slice(0, 5), role: row.role,
  });
}
function toRow(input: ShiftInput) {
  return { person_name: input.personName, date: input.date, starts_at: input.startsAt, ends_at: input.endsAt, role: input.role };
}
function throwDbError(error: { code?: string } | null) {
  if (error) throw new AppError("INTERNAL_ERROR", 500);
}
export function createSupabaseShiftRepository(client: SupabaseClient): ShiftRepository {
  return {
    async list() {
      const { data, error } = await client.from("shifts").select(columns)
        .order("date").order("starts_at").order("person_name").order("id");
      throwDbError(error);
      return (data ?? []).map(toShift);
    },
    async create(input) {
      const { data, error } = await client.from("shifts").insert(toRow(input)).select(columns).single();
      throwDbError(error);
      if (!data) throw new AppError("INTERNAL_ERROR", 500);
      return toShift(data);
    },
    async update(id, input) {
      const { data, error } = await client.from("shifts").update(toRow(input)).eq("id", id).select(columns).maybeSingle();
      throwDbError(error);
      if (!data) throw new AppError("NOT_FOUND", 404);
      return toShift(data);
    },
    async remove(id) {
      const { data, error } = await client.from("shifts").delete().eq("id", id).select("id").maybeSingle();
      throwDbError(error);
      if (!data) throw new AppError("NOT_FOUND", 404);
    },
  };
}
