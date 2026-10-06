import { describe, expect, it } from "vitest";
import { blockState, blocksOf, minutesUntil, nextBlock, parseRoster, withoutExisting } from "@/domain/shift/roster";
import type { Shift } from "@/domain/shift/schedule";

// 단톡방 시간표 형식(이름은 가짜)
const ROSTER = `📅 10월 7일(수)
시간
인원
09:00 ~ 10:00
가나다 / 라마바 / 사아자
10:00 ~ 12:00
차카타 / ✅파하가 / 나다라
19:00
마무리 — 다 같이
📅 10월 8일
시간
인원
09:00 ~ 10:00
마바사/아자차
16:00 ~ 19:00
카타파 / 하가나  / 다라마
19:00
다같이`;

describe("parseRoster — 단톡방 시간표 붙여넣기", () => {
    const { inputs, skipped } = parseRoster(ROSTER, 2026);

    it("날짜·시간대·이름을 사람별 근무로 바꾼다", () => {
        expect(inputs).toHaveLength(3 + 3 + 2 + 3);
        expect(inputs[0]).toEqual({ personName: "가나다", date: "2026-10-07", startsAt: "09:00", endsAt: "10:00", role: "부스 근무" });
        expect(inputs.at(-1)).toEqual({ personName: "다라마", date: "2026-10-08", startsAt: "16:00", endsAt: "19:00", role: "부스 근무" });
    });

    it("공백 없는 구분(마바사/아자차)과 겹친 공백도 읽는다", () => {
        expect(inputs.filter((input) => input.date === "2026-10-08" && input.startsAt === "09:00").map((input) => input.personName)).toEqual(["마바사", "아자차"]);
        expect(inputs.some((input) => input.personName === "하가나")).toBe(true);
    });

    it("✅ 표시는 이름에서 빼고 역할 끝에 붙인다", () => {
        expect(inputs.find((input) => input.personName === "파하가")?.role).toBe("부스 근무 ✅");
    });

    it("이름 없는 마무리 시간은 건너뛰고 이유를 남긴다", () => {
        expect(skipped.length).toBeGreaterThanOrEqual(2);
        expect(skipped.join("\n")).toContain("19:00");
        expect(inputs.some((input) => input.personName.includes("다같이") || input.personName.includes("마무리"))).toBe(false);
    });

    it("역할 이름을 바꿀 수 있다", () => {
        expect(parseRoster("10월 7일\n09:00~10:00 가나다", 2026, "계산").inputs[0].role).toBe("계산");
    });

    it("날짜·시간대보다 먼저 나온 이름은 건너뛴다", () => {
        const result = parseRoster("가나다 / 라마바\n10월 7일\n09:00 ~ 10:00\n사아자", 2026);
        expect(result.inputs.map((input) => input.personName)).toEqual(["사아자"]);
        expect(result.skipped[0]).toContain("가나다");
    });
});

describe("withoutExisting — 이미 등록된 근무 빼기", () => {
    it("같은 날짜·시간대·이름은 한 번만", () => {
        const one = { personName: "가나다", date: "2026-10-07", startsAt: "09:00", endsAt: "10:00", role: "부스 근무" };
        const two = { ...one, personName: "라마바" };
        expect(withoutExisting([one, two, two], [{ ...one, role: "다른 역할" }])).toEqual([two]);
    });
});

describe("타임라인 칸", () => {
    const shift = (id: string, personName: string, startsAt: string, endsAt: string, date = "2026-10-07"): Shift => ({ id, personName, date, startsAt, endsAt, role: "부스 근무" });
    const shifts = [shift("1", "라마바", "10:00", "12:00"), shift("2", "가나다", "10:00", "12:00"), shift("3", "사아자", "09:00", "10:00"), shift("4", "차카타", "09:00", "10:00", "2026-10-08")];

    it("같은 시간대 사람을 묶고 시간순으로 놓는다", () => {
        const blocks = blocksOf(shifts, "2026-10-07");
        expect(blocks.map((block) => `${block.startsAt}-${block.endsAt}`)).toEqual(["09:00-10:00", "10:00-12:00"]);
        expect(blocks[1].people.map((person) => person.personName)).toEqual(["가나다", "라마바"]);
    });

    it("지금 칸은 진행률, 다음 칸은 next, 지난 칸은 past", () => {
        const now = new Date("2026-10-07T09:30:00+09:00");
        const [first, second] = blocksOf(shifts, "2026-10-07");
        const next = nextBlock(shifts, now);
        expect(next?.key).toBe(second.key);
        expect(blockState(first, now, next?.key ?? null)).toEqual({ state: "now", progress: 0.5 });
        expect(blockState(second, now, next?.key ?? null).state).toBe("next");
        expect(blockState(first, new Date("2026-10-07T11:00:00+09:00"), null).state).toBe("past");
        expect(minutesUntil("2026-10-07", "10:00", now)).toBe(30);
    });

    it("마지막 칸이 끝나면 다음 날 첫 칸이 다음 근무", () => {
        expect(nextBlock(shifts, new Date("2026-10-07T13:00:00+09:00"))?.date).toBe("2026-10-08");
        expect(nextBlock(shifts, new Date("2026-10-09T00:00:00+09:00"))).toBeNull();
    });
});
