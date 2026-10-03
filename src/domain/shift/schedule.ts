export const SHIFT_RULES = { nameMaxLength: 80, roleMaxLength: 100, refreshMs: 30_000 } as const;

export interface ShiftInput {
  personName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  role: string;
}

export interface Shift extends ShiftInput { id: string }

export function currentShifts(shifts: readonly Shift[], now: Date): Shift[] {
  const instant = now.getTime();
  return shifts.filter((shift) => {
    const start = Date.parse(`${shift.date}T${shift.startsAt}:00+09:00`);
    const end = Date.parse(`${shift.date}T${shift.endsAt}:00+09:00`);
    return start <= instant && instant < end;
  });
}
