import { describe, expect, it } from "vitest";
import { isLiteDevice } from "@/lib/deviceTier";

describe("isLiteDevice — 보급형 기기면 장식을 가볍게", () => {
    it.each([
        [{ deviceMemory: 2, hardwareConcurrency: 8 }, true],
        [{ deviceMemory: 4, hardwareConcurrency: 8 }, true],
        [{ deviceMemory: 8, hardwareConcurrency: 8 }, false],
        [{ hardwareConcurrency: 2 }, true],
        [{ hardwareConcurrency: 6 }, false],
        [{ deviceMemory: 8, connection: { saveData: true } }, true],
        [{}, false],
    ])("%o → %s", (hints, expected) => {
        expect(isLiteDevice(hints)).toBe(expected);
    });
});
