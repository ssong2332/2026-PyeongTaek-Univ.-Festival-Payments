import type { ShiftInput } from "@/domain/shift/schedule";
import { ShiftInputSchema } from "@/lib/dto/shift";
import { AppError } from "@/lib/api/errors";
import type { ShiftRepository } from "./ports";

export function listShifts(repository: ShiftRepository) {
  return repository.list();
}

export function saveShift(repository: ShiftRepository, input: ShiftInput, id?: string) {
  const parsed = ShiftInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
  return id ? repository.update(id, parsed.data) : repository.create(parsed.data);
}

export function deleteShift(repository: ShiftRepository, id: string) {
  return repository.remove(id);
}
