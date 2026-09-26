import { describe, expect, it } from "vitest";
import { createOrder } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { OrderRepository } from "@/services/ports";

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
});
