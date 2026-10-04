import { describe, expect, it } from "vitest";
import { currentShifts } from "@/domain/shift/schedule";
import { ShiftInputSchema } from "@/lib/dto/shift";

const input = { personName: "홍길동", date: "2026-10-07", startsAt: "10:00", endsAt: "12:00", role: "주문 확인" };
const shifts = [
  { ...input, id: "11111111-1111-4111-8111-111111111111" },
  { ...input, id: "22222222-2222-4222-8222-222222222222", personName: "김철수", startsAt: "11:00", endsAt: "14:00" },
];

describe("교대 스케줄", () => {
  it("KST 현재 시간의 겹치는 담당자를 모두 반환한다", () => {
    expect(currentShifts(shifts, new Date("2026-10-07T02:00:00Z"))).toEqual(shifts);
  });
  it("시작 시각은 포함하고 종료 시각은 포함하지 않는다", () => {
    expect(currentShifts(shifts, new Date("2026-10-07T01:00:00Z"))).toEqual([shifts[0]]);
    expect(currentShifts(shifts, new Date("2026-10-07T03:00:00Z"))).toEqual([shifts[1]]);
  });
  it("다른 날짜 또는 빈 스케줄은 현재 담당자가 없다", () => {
    expect(currentShifts(shifts, new Date("2026-10-06T02:00:00Z"))).toEqual([]);
    expect(currentShifts([], new Date("2026-10-07T02:00:00Z"))).toEqual([]);
  });
  it("UTC 날짜와 다른 KST 날짜를 사용한다", () => {
    const midnight = { ...shifts[0], startsAt: "00:00", endsAt: "01:00" };
    expect(currentShifts([midnight], new Date("2026-10-06T15:30:00Z"))).toEqual([midnight]);
  });
  it("정상 입력을 받고 이름·역할의 양쪽 공백을 제거한다", () => {
    expect(ShiftInputSchema.parse({ ...input, personName: " 홍길동 ", role: " 주문 확인 " })).toEqual(input);
  });
  it.each([
    { endsAt: "09:59" }, { endsAt: "10:00" }, { startsAt: "24:00" },
    { date: "2026-02-30" }, { personName: " " }, { role: "" }, { unknown: true },
  ])("잘못된 입력 %j를 거부한다", (change) => {
    expect(ShiftInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});
