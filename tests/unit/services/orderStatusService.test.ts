import { describe, expect, it, vi } from "vitest";
import { getOrderByToken, getQueueStatus } from "@/services/orderService";
import type { OrderRepository, OrderByTokenResult } from "@/services/ports";

const VALID_TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"; // 64 hex

function createMockOrderByToken(overrides?: Partial<OrderByTokenResult>): OrderByTokenResult {
    return {
        id: "order-123",
        pickupNumber: 101,
        status: "pending",
        paymentMethod: "transfer",
        totalAmount: 12000,
        items: [
            {
                name: "씨앗호떡",
                quantity: 2,
                options: ["설탕 보통"],
                lineTotal: 6000,
            },
        ],
        createdAt: "2026-09-28T10:00:00Z",
        transferReportedAt: null,
        cancelRequestedAt: null,
        cancelRejectedAt: null,
        ...overrides,
    };
}

describe("orderService - getOrderByToken (T-11)", () => {
    it("토큰 형식이 64자리 hex가 아니면 주문 조회 없이 404 NOT_FOUND를 던진다", async () => {
        const repo: Pick<OrderRepository, "findByToken" | "countWaitingBefore"> = {
            findByToken: vi.fn(),
            countWaitingBefore: vi.fn(),
        };

        const invalidTokens = [
            "short-token",
            "a".repeat(63),
            "a".repeat(65),
            "G".repeat(64), // 대문자나 hex 외 문자
            "12345!@#$",
        ];

        for (const token of invalidTokens) {
            await expect(getOrderByToken(token, { orderRepository: repo })).rejects.toMatchObject({
                code: "NOT_FOUND",
                status: 404,
            });
        }

        expect(repo.findByToken).not.toHaveBeenCalled();
    });

    it("토큰으로 주문을 찾을 수 없으면 404 NOT_FOUND를 던진다", async () => {
        const repo: Pick<OrderRepository, "findByToken" | "countWaitingBefore"> = {
            findByToken: vi.fn().mockResolvedValue(null),
            countWaitingBefore: vi.fn(),
        };

        await expect(getOrderByToken(VALID_TOKEN, { orderRepository: repo })).rejects.toMatchObject({
            code: "NOT_FOUND",
            status: 404,
        });

        expect(repo.findByToken).toHaveBeenCalledWith(VALID_TOKEN);
    });

    it("정상 주문 조회 시 aheadCount와 파생 플래그를 정확히 계산하여 반환한다", async () => {
        const mockOrder = createMockOrderByToken();
        const repo: Pick<OrderRepository, "findByToken" | "countWaitingBefore"> = {
            findByToken: vi.fn().mockResolvedValue(mockOrder),
            countWaitingBefore: vi.fn().mockResolvedValue(3),
        };

        const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });

        expect(result).toEqual({
            orderId: "order-123",
            pickupNumber: 101,
            status: "pending",
            paymentMethod: "transfer",
            totalAmount: 12000,
            items: mockOrder.items,
            createdAt: "2026-09-28T10:00:00.000Z",
            transferReportedAt: null,
            cancelRequestedAt: null,
            cancelRejectedAt: null,
            aheadCount: 3,
            canTransferReport: true,
            canCancelRequest: true,
        });

        expect(repo.countWaitingBefore).toHaveBeenCalledWith("2026-09-28T10:00:00Z");
    });

    it("DB 시각(µs, +00:00)은 응답에서 ISO UTC(ms, Z)로 바꾸고 대기 수 집계에는 원본을 그대로 넘긴다", async () => {
        const mockOrder = createMockOrderByToken({
            createdAt: "2026-10-07T01:02:03.123456+00:00",
            transferReportedAt: "2026-10-07T01:05:00.5+00:00",
            cancelRequestedAt: "2026-10-07T01:06:00+00:00",
            cancelRejectedAt: null,
        });
        const repo = {
            findByToken: vi.fn().mockResolvedValue(mockOrder),
            countWaitingBefore: vi.fn().mockResolvedValue(2),
        };

        const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });

        expect(result).toMatchObject({
            createdAt: "2026-10-07T01:02:03.123Z",
            transferReportedAt: "2026-10-07T01:05:00.500Z",
            cancelRequestedAt: "2026-10-07T01:06:00.000Z",
            cancelRejectedAt: null,
        });
        // ms로 깎은 값을 넘기면 같은 ms 안에 먼저 생성된 주문이 대기 수에서 빠진다.
        expect(repo.countWaitingBefore).toHaveBeenCalledWith("2026-10-07T01:02:03.123456+00:00");
    });

    it("해석할 수 없는 DB 시각이면 다른 표기를 내보내지 않고 RangeError를 던진다(withHandler에서 500)", async () => {
        const repo = {
            findByToken: vi.fn().mockResolvedValue(createMockOrderByToken({ createdAt: "not-a-date" })),
            countWaitingBefore: vi.fn().mockResolvedValue(0),
        };

        await expect(getOrderByToken(VALID_TOKEN, { orderRepository: repo })).rejects.toThrow(RangeError);
    });

    describe("canTransferReport 플래그 계산 검증", () => {
        it("계좌이체이고 pending이며 아직 미신고인 경우 true", async () => {
            const mockOrder = createMockOrderByToken({
                paymentMethod: "transfer",
                status: "pending",
                transferReportedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canTransferReport).toBe(true);
        });

        it("현금 주문인 경우 false", async () => {
            const mockOrder = createMockOrderByToken({
                paymentMethod: "cash",
                status: "pending",
                transferReportedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canTransferReport).toBe(false);
        });

        it("이미 송금 신고를 한 경우 false", async () => {
            const mockOrder = createMockOrderByToken({
                paymentMethod: "transfer",
                status: "pending",
                transferReportedAt: "2026-09-28T10:05:00Z",
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canTransferReport).toBe(false);
        });

        it("이미 결제완료(paid) 상태인 경우 false", async () => {
            const mockOrder = createMockOrderByToken({
                paymentMethod: "transfer",
                status: "paid",
                transferReportedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canTransferReport).toBe(false);
        });
    });

    describe("canCancelRequest 플래그 계산 검증", () => {
        it("pending 상태이고 취소 요청/거절 이력이 없으면 true", async () => {
            const mockOrder = createMockOrderByToken({
                status: "pending",
                cancelRequestedAt: null,
                cancelRejectedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canCancelRequest).toBe(true);
        });

        it("paid 상태이고 취소 요청/거절 이력이 없으면 true", async () => {
            const mockOrder = createMockOrderByToken({
                status: "paid",
                cancelRequestedAt: null,
                cancelRejectedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canCancelRequest).toBe(true);
        });

        it("cooking(조리중) 상태이면 false", async () => {
            const mockOrder = createMockOrderByToken({
                status: "cooking",
                cancelRequestedAt: null,
                cancelRejectedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canCancelRequest).toBe(false);
        });

        it("이미 취소 요청한 상태(cancelRequestedAt 있음)이면 false", async () => {
            const mockOrder = createMockOrderByToken({
                status: "pending",
                cancelRequestedAt: "2026-09-28T10:02:00Z",
                cancelRejectedAt: null,
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canCancelRequest).toBe(false);
        });

        it("관리자가 취소 요청을 거절한 상태(cancelRejectedAt 있음)이면 false", async () => {
            const mockOrder = createMockOrderByToken({
                status: "pending",
                cancelRequestedAt: null,
                cancelRejectedAt: "2026-09-28T10:03:00Z",
            });
            const repo = {
                findByToken: vi.fn().mockResolvedValue(mockOrder),
                countWaitingBefore: vi.fn().mockResolvedValue(0),
            };

            const result = await getOrderByToken(VALID_TOKEN, { orderRepository: repo });
            expect(result.canCancelRequest).toBe(false);
        });
    });
});

describe("orderService - getQueueStatus (T-11)", () => {
    it("대기 중인 전체 주문 수를 countWaitingBefore(null)로 조회하여 반환한다", async () => {
        const repo = {
            countWaitingBefore: vi.fn().mockResolvedValue(5),
        };

        const result = await getQueueStatus({ orderRepository: repo });

        expect(result).toEqual({ waitingCount: 5 });
        expect(repo.countWaitingBefore).toHaveBeenCalledWith(null);
    });
});
