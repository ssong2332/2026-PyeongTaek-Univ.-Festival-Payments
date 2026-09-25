import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// create_order rpc 결과만 바꿔 끼운다.
const rpc = vi.fn();
vi.mock("@/infra/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ rpc })),
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

async function post(payload: unknown) {
  const { POST } = await import("@/app/api/orders/route");
  const request = new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  const response = await POST(request);
  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  rpc.mockReset();
});

describe("POST /api/orders", () => {
  it("새 주문이면 201과 CreateOrderResponse를 돌려준다", async () => {
    rpc.mockResolvedValue({ data: rpcResult, error: null });
    const { status, json } = await post(body);
    expect(status).toBe(201);
    expect(json).toEqual(rpcResult);
    expect(rpc).toHaveBeenCalledWith("create_order", expect.objectContaining({ p_idempotency_key: body.idempotencyKey }));
  });

  it("같은 멱등키 재요청(created=false)이면 200", async () => {
    rpc.mockResolvedValue({ data: { ...rpcResult, created: false }, error: null });
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
    rpc.mockResolvedValue({ data: null, error: { message: "OUT_OF_STOCK", code: "P0001" } });
    const { status, json } = await post(body);
    expect(status).toBe(409);
    expect(json.error).toMatchObject({ code: "OUT_OF_STOCK", message: "Out of stock." });
  });

  it("알 수 없는 DB 에러는 500 INTERNAL_ERROR, DB 메시지를 노출하지 않는다", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused", code: "08006" } });
    const { status, json } = await post(body);
    expect(status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(json)).not.toContain("connection refused");
  });
});
