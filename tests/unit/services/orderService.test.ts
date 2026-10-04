import { describe, expect, it, vi } from "vitest";
import { createOrder } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { OrderRepository, RateLimitRepository, Clock } from "@/services/ports";
import { logger } from "@/lib/logger";

const dto: CreateOrderRequest = {
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  paymentMethod: "transfer",
  locale: "ko",
  items: [{ menuItemId: "33333333-3333-4333-8333-333333333333", quantity: 2, optionIds: [] }],
};

const created: CreateOrderResponse = {
  orderId: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 151,
  statusToken: "a".repeat(64),
  status: "pending",
  totalAmount: 6000,
  createdAt: "2026-09-25T01:00:00.000Z",
  created: true,
};

function fakeRepo(result: CreateOrderResponse | Error, existing: CreateOrderResponse | null = null) {
  const createCalls: CreateOrderRequest[] = [];
  const lookupCalls: string[] = [];
  const orderRepository: Pick<OrderRepository, "createOrder" | "findByIdempotencyKey"> = {
    async findByIdempotencyKey(key) {
      lookupCalls.push(key);
      return existing;
    },
    async createOrder(input) {
      createCalls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { orderRepository, createCalls, lookupCalls };
}

function fakeRateLimitRepo(allowed: boolean = true) {
  const consumeCalls: Array<{ scope: string; key: string; limit: number; windowSeconds: number; now?: Date }> = [];
  const rateLimitRepository: RateLimitRepository = {
    async consume(scope, key, limit, windowSeconds, now) {
      consumeCalls.push({ scope, key, limit, windowSeconds, now });
      return allowed;
    },
  };
  return { rateLimitRepository, consumeCalls };
}

describe("orderService.createOrder", () => {
  it("새 멱등키면 검증된 요청을 그대로 repo.createOrder에 넘기고 DB 결과를 쓴다", async () => {
    const { orderRepository, createCalls, lookupCalls } = fakeRepo(created);
    const result = await createOrder(dto, { orderRepository });
    expect(lookupCalls).toEqual([dto.idempotencyKey]);
    expect(createCalls).toEqual([dto]);
    expect(result).toEqual(created);
  });

  it("이미 있는 멱등키면 create_order를 부르지 않고 기존 주문(created=false)을 돌려준다 — ADR-0009 ①", async () => {
    const existing = { ...created, status: "paid" as const, created: false };
    const { orderRepository, createCalls } = fakeRepo(created, existing);
    expect(await createOrder(dto, { orderRepository })).toEqual(existing);
    expect(createCalls).toHaveLength(0);
  });

  it("선조회 뒤 동시에 들어온 재요청은 create_order가 created=false로 돌려준 결과를 그대로 쓴다", async () => {
    const { orderRepository } = fakeRepo({ ...created, created: false });
    expect((await createOrder(dto, { orderRepository })).created).toBe(false);
  });

  it.each(["OUT_OF_STOCK", "MENU_UNAVAILABLE", "INVALID_OPTION"] as const)("repo의 %s(409)를 그대로 전달한다", async (code) => {
    const { orderRepository } = fakeRepo(new AppError(code, 409));
    const error = await createOrder(dto, { orderRepository }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code, status: 409 });
  });

  describe("T-51 속도 제한 (ADR-0009 / F-47)", () => {
    it("기존 멱등키 재요청은 속도 제한 카운트를 소모하지 않는다 (선조회 즉시 반환)", async () => {
      const existing = { ...created, status: "paid" as const, created: false };
      const { orderRepository } = fakeRepo(created, existing);
      const { rateLimitRepository, consumeCalls } = fakeRateLimitRepo(true);

      const result = await createOrder(dto, {
        orderRepository,
        rateLimitRepository,
        clientKey: "1234567890abcdef1234567890abcdef",
      });

      expect(result).toEqual(existing);
      expect(consumeCalls).toHaveLength(0);
    });

    it("신규 주문은 rateLimitRepository.consume을 호출하고 정상 통과 시 createOrder를 호출한다", async () => {
      const { orderRepository, createCalls } = fakeRepo(created);
      const { rateLimitRepository, consumeCalls } = fakeRateLimitRepo(true);
      const clientKey = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
      const now = new Date("2026-09-29T12:00:30.000Z");
      const clock: Clock = { now: () => now };

      const result = await createOrder(dto, {
        orderRepository,
        rateLimitRepository,
        clientKey,
        clock,
      });

      expect(result).toEqual(created);
      expect(consumeCalls).toHaveLength(1);
      expect(consumeCalls[0]).toEqual({
        scope: "order_create",
        key: clientKey,
        limit: 100,
        windowSeconds: 60,
        now,
      });
      expect(createCalls).toHaveLength(1);
    });

    it("100건 초과(101번째)로 consume이 false를 반환하면 429 RATE_LIMITED와 retryAfterSeconds를 반환하고 createOrder를 호출하지 않는다", async () => {
      const { orderRepository, createCalls } = fakeRepo(created);
      const { rateLimitRepository } = fakeRateLimitRepo(false);
      const clientKey = "abcdef1234567890abcdef1234567890";
      // 윈도(60초) 기준 30초 경과 시점 -> 남은 윈도 30초
      const now = new Date("2026-09-29T12:00:30.000Z");
      const clock: Clock = { now: () => now };

      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      let caughtError: unknown;
      try {
        await createOrder(dto, {
          orderRepository,
          rateLimitRepository,
          clientKey,
          clock,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(AppError);
      const appErr = caughtError as AppError;
      expect(appErr.code).toBe("RATE_LIMITED");
      expect(appErr.status).toBe(429);
      expect(appErr.details).toEqual({ retryAfterSeconds: 30 });
      expect(createCalls).toHaveLength(0);

      // 로그에 keyPrefix(앞 8자)가 기록되고 원본 IP나 전체 키는 남기지 않는지 확인
      expect(warnSpy).toHaveBeenCalledWith("order.rate_limited", {
        keyPrefix: "abcdef12",
      });

      warnSpy.mockRestore();
    });

    it("100건까지는 성공하고 101번째에 429 예외를 던진다", async () => {
      let count = 0;
      const rateLimitRepository: RateLimitRepository = {
        async consume() {
          if (count < 100) {
            count++;
            return true;
          }
          return false;
        },
      };

      const { orderRepository, createCalls } = fakeRepo(created);

      // 100건 순차 호출
      for (let i = 0; i < 100; i++) {
        const res = await createOrder(
          { ...dto, idempotencyKey: `55555555-5555-4555-8555-55555555${String(i).padStart(4, "0")}` },
          { orderRepository, rateLimitRepository, clientKey: "test-client-key" },
        );
        expect(res).toBeDefined();
      }
      expect(createCalls).toHaveLength(100);

      // 101번째 호출은 429
      await expect(
        createOrder(
          { ...dto, idempotencyKey: "55555555-5555-4555-8555-555555559999" },
          { orderRepository, rateLimitRepository, clientKey: "test-client-key" },
        ),
      ).rejects.toMatchObject({
        code: "RATE_LIMITED",
        status: 429,
      });

      // 101번째 호출은 주문을 생성하지 않음 (createCalls는 여전히 100)
      expect(createCalls).toHaveLength(100);
    });
  });
});
