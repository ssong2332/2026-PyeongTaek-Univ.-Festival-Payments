import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// 멱등키 선조회(orders select) 결과와 rpc 결과를 바꿔 끼운다.
const rpc = vi.fn();
const existingOrder = vi.fn();
vi.mock("@/infra/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: existingOrder }) }) }),
  })),
}));

const MENU_ID = "33333333-3333-4333-8333-333333333333";

const body = {
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  paymentMethod: "cash",
  locale: "ko",
  items: [{ menuItemId: MENU_ID, quantity: 2, optionIds: [] }],
};

const rpcResult = {
  orderId: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 151,
  statusToken: "a".repeat(64),
  totalAmount: 6000,
  status: "pending",
  createdAt: "2026-09-26T01:00:00.000Z",
  created: true,
};

async function post(payload: unknown, customHeaders?: Record<string, string>) {
  const { POST } = await import("@/app/api/orders/route");
  const request = new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", ...(customHeaders ?? {}) },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  const response = await POST(request);
  return { status: response.status, json: await response.json(), headers: response.headers };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === "consume_rate_limit") return { data: true, error: null };
    return { data: rpcResult, error: null };
  });
  existingOrder.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("POST /api/orders", () => {
  it("새 주문이면 201과 CreateOrderResponse를 돌려준다", async () => {
    const { status, json } = await post(body);
    expect(status).toBe(201);
    expect(json).toEqual(rpcResult);
    expect(rpc).toHaveBeenCalledWith("create_order", expect.objectContaining({ p_idempotency_key: body.idempotencyKey }));
  });

  it("이미 있는 멱등키면 create_order를 부르지 않고 200 + 기존 주문 (속도 제한도 미소비)", async () => {
    existingOrder.mockResolvedValue({
      data: {
        id: rpcResult.orderId, pickup_number: 151, status_token: rpcResult.statusToken,
        status: "paid", total_amount: 6000, created_at: "2026-09-26T01:00:00+00:00",
      },
      error: null,
    });
    const { status, json } = await post(body);
    expect(status).toBe(200);
    expect(json).toEqual({ ...rpcResult, status: "paid", created: false });
    expect(rpc).not.toHaveBeenCalledWith("create_order", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("consume_rate_limit", expect.anything());
  });

  it("선조회 뒤 create_order가 created=false를 돌려주면 200", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "consume_rate_limit") return { data: true, error: null };
      return { data: { ...rpcResult, created: false }, error: null };
    });
    const { status, json } = await post(body);
    expect(status).toBe(200);
    expect(json.created).toBe(false);
  });

  it("가격 필드가 들어오면 400 VALIDATION_ERROR, DB는 호출하지 않는다", async () => {
    const { status, json } = await post({ ...body, totalAmount: 0 });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.details).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("허용 외 결제수단이면 400 VALIDATION_ERROR", async () => {
    const { status, json } = await post({ ...body, paymentMethod: "kakaopay" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("JSON이 아닌 본문이면 400 VALIDATION_ERROR", async () => {
    const { status, json } = await post("{not json");
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("재고 부족이면 409 OUT_OF_STOCK 봉투", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "consume_rate_limit") return { data: true, error: null };
      return { data: null, error: { message: "OUT_OF_STOCK", code: "P0001" } };
    });
    const { status, json } = await post(body);
    expect(status).toBe(409);
    expect(json.error).toMatchObject({ code: "OUT_OF_STOCK", message: "Out of stock." });
  });

  it("알 수 없는 DB 에러는 500 INTERNAL_ERROR, DB 메시지를 노출하지 않는다", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "consume_rate_limit") return { data: true, error: null };
      return { data: null, error: { message: "connection refused", code: "08006" } };
    });
    const { status, json } = await post(body);
    expect(status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(json)).not.toContain("connection refused");
  });

  describe("T-51 속도 제한 (ADR-0009 / F-47)", () => {
    it("속도 제한 초과 시 429 RATE_LIMITED와 Retry-After 헤더를 반환하고 create_order는 호출하지 않는다", async () => {
      rpc.mockImplementation(async (name: string) => {
        if (name === "consume_rate_limit") return { data: false, error: null };
        return { data: rpcResult, error: null };
      });
      const { status, json, headers } = await post(body);
      expect(status).toBe(429);
      expect(json.error.code).toBe("RATE_LIMITED");
      expect(json.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(headers.get("retry-after")).toBeDefined();
      expect(headers.get("retry-after")).toBe(String(json.error.details.retryAfterSeconds));
      expect(rpc).not.toHaveBeenCalledWith("create_order", expect.anything());
    });

    it("cf-connecting-ip 헤더가 있으면 sha256 32자 키로 consume_rate_limit을 호출한다", async () => {
      const { status } = await post(body, { "cf-connecting-ip": "203.0.113.195" });
      expect(status).toBe(201);
      expect(rpc).toHaveBeenCalledWith(
        "consume_rate_limit",
        expect.objectContaining({
          p_scope: "order_create",
          p_key: expect.stringMatching(/^[0-9a-f]{32}$/),
          p_limit: 100,
          p_window_seconds: 60,
        }),
      );
    });
  });
});
