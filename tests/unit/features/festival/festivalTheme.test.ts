// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyFestival, FESTIVAL_STOPS } from "@/features/festival/festivalTheme";

// 휴대폰 현지 시각(오늘 날짜의 시:분)을 밀리초로 — applyFestival은 getHours/getMinutes만 본다.
function at(hours: number, minutes = 0): number {
    const date = new Date(2026, 9, 7, hours, minutes, 0, 0);
    return date.getTime();
}

const root = () => document.documentElement;
const cssVar = (name: string) => root().style.getPropertyValue(name);

describe("applyFestival — 시간대 축제 분위기", () => {
    afterEach(() => {
        root().removeAttribute("style");
        root().removeAttribute("data-daylight");
    });

    it("07:30 아침은 밝은 크림빛 시작점이고 축제 이펙트·군중이 없다", () => {
        const state = applyFestival(FESTIVAL_STOPS, at(7, 30));
        expect(state).toMatchObject({ p: 0, fx: 0, crowd: 0, ember: 0, daylight: true });
        expect(cssVar("--fest-iron")).toBe("rgba(255,250,243,1.000)");
        expect(cssVar("--fest-dough")).toBe("rgba(59,26,8,1.000)");
        expect(cssVar("--fest-crowd")).toBe("0.000");
        expect(root().hasAttribute("data-daylight")).toBe(true);
    });

    it("10:30 오전 → 12:00 낮으로 색이 연속으로 주황 쪽으로 진해지고, 14시 전까지 불꽃은 시작하지 않는다", () => {
        const morning = applyFestival(FESTIVAL_STOPS, at(10, 30));
        const noon = applyFestival(FESTIVAL_STOPS, at(12));
        const beforeTwo = applyFestival(FESTIVAL_STOPS, at(13, 59));
        expect(morning.p).toBeCloseTo(0.25);
        expect(noon.p).toBeCloseTo(0.45);
        expect(beforeTwo.p).toBeGreaterThan(noon.p);
        expect(beforeTwo.fx).toBe(0);
        expect(beforeTwo.daylight).toBe(true);
        // 군중은 늦은 오전부터 조금씩 모인다
        expect(beforeTwo.crowd).toBeGreaterThan(0.3);
    });

    it("14:30 축제 이펙트 등장 → 15:30 활발 → 17:00 최고조", () => {
        const twoThirty = applyFestival(FESTIVAL_STOPS, at(14, 30));
        const threeThirty = applyFestival(FESTIVAL_STOPS, at(15, 30));
        const four = applyFestival(FESTIVAL_STOPS, at(16));
        const five = applyFestival(FESTIVAL_STOPS, at(17));
        expect(twoThirty.fx).toBeCloseTo(0.2);
        expect(threeThirty.fx).toBeCloseTo(0.6);
        expect(four.p).toBe(1);
        expect(five).toMatchObject({ fx: 1, crowd: 1, ember: 1, daylight: false });
        expect(twoThirty.fx).toBeLessThan(threeThirty.fx);
        expect(twoThirty.daylight).toBe(false);
        expect(root().hasAttribute("data-daylight")).toBe(false);
    });

    it("18:00 축제가 끝나며 어두워지고, 22:00부터 새벽 5시까지는 지금의 야간 UI(검정+시럽)를 유지한다", () => {
        const five = applyFestival(FESTIVAL_STOPS, at(17));
        const six = applyFestival(FESTIVAL_STOPS, at(18));
        expect(six.p).toBeGreaterThan(five.p);
        expect(six.fx).toBeLessThan(five.fx);
        const night = applyFestival(FESTIVAL_STOPS, at(22));
        expect(night.p).toBeCloseTo(1.6);
        expect(cssVar("--fest-iron")).toBe("rgba(21,18,26,1.000)");
        for (const time of [at(23, 59), at(2), at(4, 59)]) {
            expect(applyFestival(FESTIVAL_STOPS, time)).toEqual(night);
            expect(cssVar("--fest-iron")).toBe("rgba(21,18,26,1.000)");
        }
        // 밤에도 불꽃이 가끔은 터진다
        expect(night.fx).toBeGreaterThan(0);
    });

    it("밝은 화면에서 어두운 화면으로 넘어갈 때 글씨는 바탕과 반대 밝기를 유지한다(중간 회색이 없다)", () => {
        const luminance = (rgba: string) => {
            const [r, g, b] = rgba.slice(5, -1).split(",").map(Number);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        for (const time of [at(13, 59), at(14, 0), at(14, 1), at(14, 2), at(16), at(17), at(18), at(22)]) {
            applyFestival(FESTIVAL_STOPS, time);
            const bg = luminance(cssVar("--fest-iron2"));
            const fg = luminance(cssVar("--fest-dough"));
            expect(Math.abs(bg - fg)).toBeGreaterThan(120);
        }
    });

    it("인라인 스크립트로 심을 수 있게 바깥 참조 없이 문자열로 실행된다", () => {
        const boot = new Function(`return (${applyFestival.toString()})(${JSON.stringify(FESTIVAL_STOPS)}, ${at(9)})`);
        const state = boot() as ReturnType<typeof applyFestival>;
        expect(state.daylight).toBe(true);
        expect(cssVar("--fest-sky1")).not.toBe("");
        expect(cssVar("--fest-sil")).not.toBe("");
    });
});
