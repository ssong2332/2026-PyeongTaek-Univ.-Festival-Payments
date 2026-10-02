// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    MY_ORDERS_LIMIT,
    MY_ORDERS_STORAGE_KEY,
    MY_ORDER_TTL_MS,
    forgetMyOrder,
    readMyOrders,
    saveMyOrder,
} from "@/features/customer/myOrders";
import type { CreateOrderResponse } from "@/lib/dto/order";

// #89: 주문 성공 시 상태 페이지 토큰·픽업 번호를 이 기기(localStorage)에 남겨 메뉴판에서 돌아갈 수 있게 한다.
const T0 = new Date("2026-10-07T03:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();
// 서버 토큰과 같은 형식(소문자 16진수 64자)
const token = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const stored = () => localStorage.getItem(MY_ORDERS_STORAGE_KEY);
const storeRaw = (value: unknown) => localStorage.setItem(MY_ORDERS_STORAGE_KEY, JSON.stringify(value));
const tokensOf = (orders: { statusToken: string }[]) => orders.map((order) => order.statusToken);

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("saveMyOrder / readMyOrders — 저장", () => {
    it("정상: 버전 키(ptu.myOrders.v1)에 토큰·픽업 번호·저장 시각(ISO)을 남기고 그대로 읽는다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 5 }, T0);

        expect(MY_ORDERS_STORAGE_KEY).toBe("ptu.myOrders.v1");
        const expected = [{ statusToken: token(1), pickupNumber: 5, savedAt: "2026-10-07T03:00:00.000Z" }];
        expect(JSON.parse(stored() ?? "null")).toEqual(expected);
        expect(readMyOrders(at(1_000))).toEqual(expected);
    });

    it("주문 생성 응답을 그대로 넘겨도 토큰·픽업 번호·저장 시각만 남긴다(금액·주문 ID 없음)", () => {
        const response: CreateOrderResponse = {
            orderId: "99999999-9999-4999-8999-999999999999",
            pickupNumber: 12,
            statusToken: token(2),
            status: "pending",
            totalAmount: 8000,
            createdAt: "2026-10-07T02:59:59.000Z",
            created: true,
        };
        saveMyOrder(response, T0);

        expect(JSON.parse(stored() ?? "null")).toEqual([{ statusToken: token(2), pickupNumber: 12, savedAt: iso(0) }]);
    });

    it("최신순: 나중에 저장한 주문이 앞에 온다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, at(0));
        saveMyOrder({ statusToken: token(2), pickupNumber: 2 }, at(60_000));

        expect(readMyOrders(at(120_000)).map((order) => order.pickupNumber)).toEqual([2, 1]);
    });

    it("같은 토큰을 다시 저장하면(멱등 재요청) 한 건만 남고, 새 저장 시각으로 맨 앞에 온다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, at(0));
        saveMyOrder({ statusToken: token(2), pickupNumber: 2 }, at(1_000));
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, at(2_000));

        const orders = readMyOrders(at(3_000));
        expect(tokensOf(orders)).toEqual([token(1), token(2)]);
        expect(orders[0].savedAt).toBe(iso(2_000));
    });

    it("경계: 5건까지는 모두 남고, 6번째를 저장하면 가장 오래된 1건이 빠진다", () => {
        expect(MY_ORDERS_LIMIT).toBe(5);
        for (let n = 1; n <= 5; n++) saveMyOrder({ statusToken: token(n), pickupNumber: n }, at(n * 1_000));
        expect(readMyOrders(at(10_000)).map((order) => order.pickupNumber)).toEqual([5, 4, 3, 2, 1]);

        saveMyOrder({ statusToken: token(6), pickupNumber: 6 }, at(6_000));
        expect(readMyOrders(at(10_000)).map((order) => order.pickupNumber)).toEqual([6, 5, 4, 3, 2]);
        expect(JSON.parse(stored() ?? "[]")).toHaveLength(5);
    });

    it.each([
        ["토큰이 대문자", { statusToken: token(10).toUpperCase(), pickupNumber: 1 }],
        ["토큰이 63자", { statusToken: token(10).slice(1), pickupNumber: 1 }],
        ["토큰이 빈 문자열", { statusToken: "", pickupNumber: 1 }],
        ["픽업 번호 0", { statusToken: token(10), pickupNumber: 0 }],
        ["픽업 번호 음수", { statusToken: token(10), pickupNumber: -3 }],
        ["픽업 번호 소수", { statusToken: token(10), pickupNumber: 1.5 }],
    ])("형식이 틀리면(%s) 저장하지 않는다", (_label, order) => {
        saveMyOrder(order, T0);

        expect(stored()).toBeNull();
        expect(readMyOrders(T0)).toEqual([]);
    });
});

describe("readMyOrders — 24시간 만료(읽을 때 제거)", () => {
    it("경계: 저장 후 24시간 - 1ms는 남고, 정확히 24시간이면 목록에서 빠지고 저장소에서도 지운다", () => {
        expect(MY_ORDER_TTL_MS).toBe(24 * 60 * 60 * 1000);
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);

        expect(tokensOf(readMyOrders(at(MY_ORDER_TTL_MS - 1)))).toEqual([token(1)]);
        expect(readMyOrders(at(MY_ORDER_TTL_MS))).toEqual([]);
        expect(stored()).toBeNull();
    });

    it("일부만 지났으면 지난 것만 지우고, 저장소도 남은 목록으로 줄인다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, at(0));
        saveMyOrder({ statusToken: token(2), pickupNumber: 2 }, at(2 * 60 * 60 * 1000));

        const now = at(MY_ORDER_TTL_MS + 60 * 60 * 1000);
        expect(tokensOf(readMyOrders(now))).toEqual([token(2)]);
        expect(tokensOf(JSON.parse(stored() ?? "[]"))).toEqual([token(2)]);
    });

    it("저장할 때도 지난 항목은 함께 정리한다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, at(0));
        saveMyOrder({ statusToken: token(2), pickupNumber: 2 }, at(MY_ORDER_TTL_MS));

        expect(tokensOf(JSON.parse(stored() ?? "[]"))).toEqual([token(2)]);
    });
});

describe("readMyOrders — 손상된 저장값", () => {
    it("깨진 JSON이면 예외 없이 빈 목록이고, 다음 저장은 새 목록으로 덮어쓴다", () => {
        localStorage.setItem(MY_ORDERS_STORAGE_KEY, "{not json");

        expect(readMyOrders(T0)).toEqual([]);
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);
        expect(tokensOf(JSON.parse(stored() ?? "[]"))).toEqual([token(1)]);
    });

    it.each([
        ["객체", { statusToken: "a".repeat(64), pickupNumber: 1, savedAt: "2026-10-07T03:00:00.000Z" }],
        ["null", null],
        ["숫자", 42],
        ["문자열", "orders"],
    ])("배열이 아니면(%s) 빈 목록", (_label, value) => {
        storeRaw(value);

        expect(readMyOrders(T0)).toEqual([]);
    });

    it("형식이 틀린 항목만 버린다(토큰·픽업 번호·저장 시각·필드 누락·null)", () => {
        const valid = { statusToken: token(1), pickupNumber: 7, savedAt: iso(0) };
        storeRaw([
            { statusToken: token(0xab).toUpperCase(), pickupNumber: 2, savedAt: iso(0) },
            { statusToken: token(3).slice(1), pickupNumber: 3, savedAt: iso(0) },
            { statusToken: token(4), pickupNumber: 0, savedAt: iso(0) },
            { statusToken: token(5), pickupNumber: "5", savedAt: iso(0) },
            { statusToken: token(6), pickupNumber: 6, savedAt: "어제" },
            { statusToken: token(7), pickupNumber: 7 },
            null,
            "a".repeat(64),
            valid,
        ]);

        expect(readMyOrders(at(1_000))).toEqual([valid]);
        expect(JSON.parse(stored() ?? "[]")).toEqual([valid]);
    });

    it("손으로 바뀐 저장값이 최신순이 아니고, 같은 토큰이 겹치고, 5건을 넘어도 최신순·중복 없이 5건으로 읽는다", () => {
        storeRaw([
            { statusToken: token(1), pickupNumber: 1, savedAt: iso(1_000) },
            { statusToken: token(2), pickupNumber: 2, savedAt: iso(6_000) },
            { statusToken: token(1), pickupNumber: 1, savedAt: iso(7_000) },
            { statusToken: token(3), pickupNumber: 3, savedAt: iso(3_000) },
            { statusToken: token(4), pickupNumber: 4, savedAt: iso(4_000) },
            { statusToken: token(5), pickupNumber: 5, savedAt: iso(5_000) },
            { statusToken: token(6), pickupNumber: 6, savedAt: iso(2_000) },
        ]);

        const orders = readMyOrders(at(10_000));
        expect(orders.map((order) => order.pickupNumber)).toEqual([1, 2, 5, 4, 3]);
        expect(orders[0].savedAt).toBe(iso(7_000));
    });
});

describe("저장소 예외 — 주문 흐름을 막지 않는다", () => {
    it("저장소 접근 자체가 막히면(SecurityError) 읽기는 빈 목록, 저장·삭제는 예외 없이 넘어간다", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });

        expect(readMyOrders(T0)).toEqual([]);
        expect(() => saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0)).not.toThrow();
        expect(() => forgetMyOrder(token(1), T0)).not.toThrow();
    });

    it("읽기(getItem)가 실패하면 빈 목록", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });

        expect(readMyOrders(T0)).toEqual([]);
    });

    it("쓰기(setItem)가 실패하면(용량 초과) 저장은 예외 없이 끝나고 기존 목록은 그대로다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError");
        });

        expect(() => saveMyOrder({ statusToken: token(2), pickupNumber: 2 }, at(1_000))).not.toThrow();
        vi.restoreAllMocks();
        expect(tokensOf(readMyOrders(at(2_000)))).toEqual([token(1)]);
    });

    it("지우기(removeItem)가 실패해도 예외 없이 넘어간다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });

        expect(() => forgetMyOrder(token(1), at(1_000))).not.toThrow();
    });
});

describe("forgetMyOrder — 끝난 주문 정리", () => {
    it("그 토큰만 지우고 나머지는 순서대로 남긴다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, at(0));
        saveMyOrder({ statusToken: token(2), pickupNumber: 2 }, at(1_000));
        saveMyOrder({ statusToken: token(3), pickupNumber: 3 }, at(2_000));

        forgetMyOrder(token(2), at(2_500));

        expect(tokensOf(readMyOrders(at(3_000)))).toEqual([token(3), token(1)]);
    });

    it("저장되지 않은 토큰이면 아무것도 바꾸지 않는다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);
        const before = stored();

        forgetMyOrder(token(9), at(1_000));

        expect(stored()).toBe(before);
    });

    it("마지막 한 건을 지우면 키 자체를 지운다", () => {
        saveMyOrder({ statusToken: token(1), pickupNumber: 1 }, T0);

        forgetMyOrder(token(1), at(1_000));

        expect(stored()).toBeNull();
    });
});
