import { z } from "zod";
import { SHIFT_RULES } from "@/domain/shift/schedule";
import { kstDayUtcRange } from "@/domain/time/kst";

const CalendarDateSchema = z.string().refine((value) => {
  try { kstDayUtcRange(value); return value >= "0001-01-01"; } catch { return false; }
}, "올바른 날짜를 입력하세요.");
const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "올바른 시각을 입력하세요.");
const fields = {
  personName: z.string().trim().min(1, "이름을 입력하세요.").max(SHIFT_RULES.nameMaxLength),
  date: CalendarDateSchema,
  startsAt: TimeSchema,
  endsAt: TimeSchema,
  role: z.string().trim().min(1, "역할을 입력하세요.").max(SHIFT_RULES.roleMaxLength),
};
const validRange = (value: { startsAt: string; endsAt: string }) => value.endsAt > value.startsAt;
const rangeError = { message: "종료 시각은 시작 시각보다 늦어야 합니다.", path: ["endsAt"] };
export const ShiftInputSchema = z.strictObject(fields).refine(validRange, rangeError);
export const ShiftSchema = z.object({ id: z.guid(), ...fields }).refine(validRange, rangeError);
export const ShiftsResponseSchema = z.object({ shifts: z.array(ShiftSchema) });
