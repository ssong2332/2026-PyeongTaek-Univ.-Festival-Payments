import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postOrderWithRetry } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";

// F-13 · DECISIONS #24: 8초 타임아웃, 네트워크 오류·타임아웃·5xx만 자동 2회(1초·2초 뒤), 4xx는 재시도 없음.
const body: CreateOrderRequest = {
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  paymentMethod: "transfer",
  locale: "ko",
  items: [{ menuItemId: "33333333-3333-4333-8333-333333333333", quantity: 1, optionIds: [] }],
};

const order: CreateOrderResponse = {
  orderId: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 151,
  statusToken: "a".repeat(64),
  status: "pending",
  totalAmount: 3000,
  createdAt: "2026-10-07T03:00:00.000Z",
  created: true,
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const envelope = (code: string, details?: unknown) => ({ error: { code, message: "x", ...(details ? { details } : {}) } });

// 응답하지 않는 요청: signal이 끊기면(타임아웃) AbortError로 끝난다.
function hang(_url: string, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// 타이머를 다 흘려보낸 뒤 결과(성공 값 또는 던진 에러)를 돌려준다.
async function run() {
  const promise = postOrderWithRetry(body).catch((e: unknown) => e);
  await vi.runAllTimersAsync();
  return promise;
}

function sentBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

describe("postOrderWithRetry", () => {
  it("POST /api/orders로 JSON을 보내고 성공하면 주문 응답을 돌려준다(재시도 없음)", async () => {
    fetchMock.mockResolvedValueOnce(json(201, order));
    expect(await run()).toEqual(order);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/orders");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(sentBodies()).toEqual([body]);
  });

  it("멱등 재요청 응답(200, created=false)도 성공으로 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...order, created: false }));
    expect(await run()).toEqual({ ...order, created: false });
  });

  it("첫 요청이 8초 타임아웃이면 같은 멱등키로 다시 보내고, 재시도 성공 시 주문 1건 응답", async () => {
    fetchMock.mockImplementationOnce(hang).mockResolvedValueOnce(json(200, { ...order, created: false }));
    expect(await run()).toEqual({ ...order, created: false });
    expect(sentBodies()).toEqual([body, body]);
  });

  it("타임아웃은 8초: 8초 전에는 재시도하지 않는다", async () => {
    fetchMock.mockImplementationOnce(hang).mockResolvedValueOnce(json(201, order));
    const promise = postOrderWithRetry(body);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("네트워크 오류는 1초·2초 뒤 두 번 재시도한다", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(201, order));
    const promise = postOrderWithRetry(body);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await promise).toEqual(order);
    expect(sentBodies()).toEqual([body, body, body]);
  });

  it("5xx는 재시도한다", async () => {
    fetchMock.mockResolvedValueOnce(json(500, envelope("INTERNAL_ERROR"))).mockResolvedValueOnce(json(201, order));
    expect(await run()).toEqual(order);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("세 번 모두 네트워크 오류면 INTERNAL_ERROR(상태 0 — 응답 없음)로 끝난다 → 화면은 수동 재시도", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const error = await run();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("세 번 모두 5xx면 서버가 준 코드·상태로 끝난다", async () => {
    fetchMock.mockImplementation(async () => json(503, envelope("INTERNAL_ERROR")));
    expect(await run()).toMatchObject({ code: "INTERNAL_ERROR", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [409, "OUT_OF_STOCK", [{ menuItemId: "m", requested: 2, available: 1 }]],
    [429, "RATE_LIMITED", { retryAfterSeconds: 30 }],
    [400, "VALIDATION_ERROR", undefined],
  ])("4xx(%i %s)는 재시도하지 않고 서버의 code·details를 그대로 던진다", async (status, code, details) => {
    fetchMock.mockResolvedValueOnce(json(status, envelope(code, details)));
    const error = await run();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code, status, details });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("성공 응답이 계약(CreateOrderResponseSchema)과 다르면 INTERNAL_ERROR, 재시도하지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { orderId: "not-a-uuid" }));
    expect(await run()).toMatchObject({ code: "INTERNAL_ERROR", status: 201 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
