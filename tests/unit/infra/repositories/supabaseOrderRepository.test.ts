import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { AppError } from "@/lib/api/errors";
import type { CreateOrderRequest } from "@/lib/dto/order";

const MENU_ID = "33333333-3333-4333-8333-333333333333";
const OPTION_ID = "44444444-4444-4444-8444-444444444444";

const dto: CreateOrderRequest = {
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  paymentMethod: "transfer",
  locale: "en",
  items: [{ menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] }],
};

const rpcResult = {
  orderId: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 151,
  statusToken: "a".repeat(64),
  totalAmount: 7000,
  status: "pending",
  createdAt: "2026-09-25T10:00:00.123+09:00",
  created: true,
};

type RpcError = { message: string; code?: string; details?: string | null };

// supabase-js의 rpc만 흉내 낸다. 호출 인자를 기록한다.
function fakeClient(response: { data: unknown; error: RpcError | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc(fn: string, args: unknown) {
      calls.push({ fn, args });
      return Promise.resolve(response);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

async function createOrderError(error: RpcError) {
  const { client } = fakeClient({ data: null, error });
  return createSupabaseOrderRepository(client).createOrder(dto).catch((e: unknown) => e);
}

describe("supabaseOrderRepository.createOrder", () => {
  it("create_order를 ADR-0002 인자 이름으로 호출한다", async () => {
    const { client, calls } = fakeClient({ data: rpcResult, error: null });
    await createSupabaseOrderRepository(client).createOrder(dto);
    expect(calls).toEqual([{
      fn: "create_order",
      args: {
        p_idempotency_key: dto.idempotencyKey,
        p_payment_method: "transfer",
        p_locale: "en",
        p_items: [{ menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] }],
      },
    }]);
  });

  it("결과를 필드 단위로 옮기고 createdAt은 UTC ISO 문자열로 맞춘다", async () => {
    const { client } = fakeClient({ data: { ...rpcResult, unexpected: "버린다" }, error: null });
    expect(await createSupabaseOrderRepository(client).createOrder(dto)).toEqual({
      orderId: rpcResult.orderId,
      pickupNumber: 151,
      statusToken: rpcResult.statusToken,
      status: "pending",
      totalAmount: 7000,
      createdAt: "2026-09-25T01:00:00.123Z",
      created: true,
    });
  });

  it("멱등 재요청(created=false)도 그대로 돌려준다", async () => {
    const { client } = fakeClient({ data: { ...rpcResult, created: false }, error: null });
    expect((await createSupabaseOrderRepository(client).createOrder(dto)).created).toBe(false);
  });

  it("멱등 재요청 시점에 이미 결제확인된 주문도 현재 상태 그대로 돌려준다", async () => {
    const { client } = fakeClient({ data: { ...rpcResult, status: "paid", created: false }, error: null });
    expect(await createSupabaseOrderRepository(client).createOrder(dto)).toMatchObject({ status: "paid", created: false });
  });

  it("알 수 없는 상태 값이면 일반 에러로 던진다", async () => {
    const { client } = fakeClient({ data: { ...rpcResult, status: "shipping" }, error: null });
    const error = await createSupabaseOrderRepository(client).createOrder(dto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
  });

  it.each(["OUT_OF_STOCK", "MENU_UNAVAILABLE", "INVALID_OPTION"])("DB 예외 %s는 AppError 409로 바꾼다", async (code) => {
    const error = await createOrderError({ message: code, code: "P0001" });
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code, status: 409 });
  });

  it("DB 예외의 detail이 JSON이면 details로 넘긴다", async () => {
    const detail = [{ menuItemId: MENU_ID, requested: 2, available: 1 }];
    const error = await createOrderError({ message: "OUT_OF_STOCK", code: "P0001", details: JSON.stringify(detail) });
    expect(error).toMatchObject({ code: "OUT_OF_STOCK", details: detail });
  });

  it("detail이 JSON이 아니면 details를 비운다", async () => {
    const error = await createOrderError({ message: "OUT_OF_STOCK", code: "P0001", details: "menu_item_id=abc" });
    expect(error).toMatchObject({ code: "OUT_OF_STOCK", details: undefined });
  });

  it.each(["EMPTY_ITEMS", "INVALID_ITEMS"])("%s는 400 VALIDATION_ERROR로 바꾼다", async (message) => {
    expect(await createOrderError({ message, code: "P0001" })).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("그 밖의 DB 에러는 AppError가 아닌 일반 에러로 던진다(핸들러가 500으로 숨기고 기록)", async () => {
    const error = await createOrderError({ message: "connection refused", code: "08006" });
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
    expect((error as Error).message).toContain("08006");
  });

  it("결과 모양이 계약과 다르면 일반 에러로 던진다", async () => {
    const { client } = fakeClient({ data: { ...rpcResult, pickupNumber: "151" }, error: null });
    const error = await createSupabaseOrderRepository(client).createOrder(dto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
  });
});
