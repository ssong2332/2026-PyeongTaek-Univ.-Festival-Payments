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

function repoReturning(result: CreateOrderResponse | Error) {
  const calls: CreateOrderRequest[] = [];
  const orderRepository: Pick<OrderRepository, "createOrder"> = {
    async createOrder(input) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { orderRepository, calls };
}

describe("orderService.createOrder", () => {
  it("검증된 요청을 그대로 repo에 넘기고 가격은 repo(DB) 결과를 쓴다", async () => {
    const { orderRepository, calls } = repoReturning(created);
    const result = await createOrder(dto, { orderRepository });
    expect(calls).toEqual([dto]);
    expect(result).toEqual(created);
  });

  it("멱등 재요청이면 created=false 결과를 그대로 돌려준다", async () => {
    const { orderRepository } = repoReturning({ ...created, created: false });
    expect((await createOrder(dto, { orderRepository })).created).toBe(false);
  });

  it.each(["OUT_OF_STOCK", "MENU_UNAVAILABLE", "INVALID_OPTION"] as const)("repo의 %s(409)를 그대로 전달한다", async (code) => {
    const { orderRepository } = repoReturning(new AppError(code, 409));
    const error = await createOrder(dto, { orderRepository }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code, status: 409 });
  });
});
