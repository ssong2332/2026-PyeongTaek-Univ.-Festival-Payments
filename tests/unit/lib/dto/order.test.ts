import { describe, expect, it } from "vitest";
import { CreateOrderRequestSchema, CreateOrderResponseSchema, OrderStatusDtoSchema } from "@/lib/dto/order";

const MENU_ID = "33333333-3333-4333-8333-333333333333";
const OPTION_ID = "44444444-4444-4444-8444-444444444444";
// supabase/seed.sql(T-36)의 메뉴 ID. RFC 9562 버전·variant 비트가 맞지 않아 z.uuid()는 거부한다.
const SEED_MENU_ID = "11111111-1111-1111-1111-111111111111";

function request(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    paymentMethod: "cash",
    locale: "ko",
    items: [{ menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] }],
    ...overrides,
  };
}

describe("CreateOrderRequestSchema", () => {
  it.each(["cash", "transfer"])("결제수단 %s는 통과한다", (paymentMethod) => {
    expect(CreateOrderRequestSchema.safeParse(request({ paymentMethod })).success).toBe(true);
  });

  it.each(["kakaopay", "toss", "card", "", null])("허용 외 결제수단 %j는 거부한다", (paymentMethod) => {
    expect(CreateOrderRequestSchema.safeParse(request({ paymentMethod })).success).toBe(false);
  });

  it("결제수단이 없으면 거부한다", () => {
    expect(CreateOrderRequestSchema.safeParse(request({ paymentMethod: undefined })).success).toBe(false);
  });

  it("클라이언트가 보낸 가격 필드는 무시하지 않고 거부한다(strict)", () => {
    expect(CreateOrderRequestSchema.safeParse(request({ totalAmount: 0 })).success).toBe(false);
    expect(CreateOrderRequestSchema.safeParse(request({
      items: [{ menuItemId: MENU_ID, quantity: 1, optionIds: [], price: 0 }],
    })).success).toBe(false);
  });

  it("간편결제 하위 수단 필드(transferMethod)도 거부한다", () => {
    expect(CreateOrderRequestSchema.safeParse(request({ paymentMethod: "transfer", transferMethod: "bank" })).success).toBe(false);
  });

  it.each([0, 100, 1.5, -1])("수량 %s는 거부한다(1..99 정수)", (quantity) => {
    expect(CreateOrderRequestSchema.safeParse(request({
      items: [{ menuItemId: MENU_ID, quantity, optionIds: [] }],
    })).success).toBe(false);
  });

  it("수량 1과 99는 통과한다", () => {
    for (const quantity of [1, 99]) {
      expect(CreateOrderRequestSchema.safeParse(request({
        items: [{ menuItemId: MENU_ID, quantity, optionIds: [] }],
      })).success).toBe(true);
    }
  });

  it("항목은 1..20개다", () => {
    const item = { menuItemId: MENU_ID, quantity: 1, optionIds: [] };
    expect(CreateOrderRequestSchema.safeParse(request({ items: [] })).success).toBe(false);
    expect(CreateOrderRequestSchema.safeParse(request({ items: Array(20).fill(item) })).success).toBe(true);
    expect(CreateOrderRequestSchema.safeParse(request({ items: Array(21).fill(item) })).success).toBe(false);
  });

  it("ID는 uuid여야 한다", () => {
    expect(CreateOrderRequestSchema.safeParse(request({ idempotencyKey: "abc" })).success).toBe(false);
    expect(CreateOrderRequestSchema.safeParse(request({
      items: [{ menuItemId: "abc", quantity: 1, optionIds: [] }],
    })).success).toBe(false);
    expect(CreateOrderRequestSchema.safeParse(request({
      items: [{ menuItemId: MENU_ID, quantity: 1, optionIds: ["abc"] }],
    })).success).toBe(false);
  });

  it("시드 메뉴처럼 RFC 버전 비트가 없는 ID도 Postgres uuid 모양이면 통과한다", () => {
    expect(CreateOrderRequestSchema.safeParse(request({
      items: [{ menuItemId: SEED_MENU_ID, quantity: 1, optionIds: ["22222222-2222-2222-2222-222222222222"] }],
    })).success).toBe(true);
  });

  it.each([
    "11111111-1111-1111-1111-11111111111", // 12자리가 아닌 마지막 묶음
    "1111111111111111-1111-111111111111", // 하이픈 위치
    "gggggggg-1111-1111-1111-111111111111", // 16진수가 아닌 문자
  ])("uuid 모양이 아닌 메뉴 ID %s는 거부한다", (menuItemId) => {
    expect(CreateOrderRequestSchema.safeParse(request({
      items: [{ menuItemId, quantity: 1, optionIds: [] }],
    })).success).toBe(false);
  });

  it("지원하지 않는 언어는 거부한다", () => {
    expect(CreateOrderRequestSchema.safeParse(request({ locale: "en" })).success).toBe(true);
    expect(CreateOrderRequestSchema.safeParse(request({ locale: "jp" })).success).toBe(false);
  });
});

describe("CreateOrderResponseSchema", () => {
  const response = {
    orderId: "22222222-2222-4222-8222-222222222222",
    pickupNumber: 151,
    statusToken: "a".repeat(64),
    status: "pending",
    totalAmount: 6000,
    createdAt: "2026-09-26T01:00:00.000Z",
    created: true,
  };

  it("계약대로의 응답은 통과한다(멱등 재요청의 현재 상태 포함)", () => {
    expect(CreateOrderResponseSchema.safeParse(response).success).toBe(true);
    expect(CreateOrderResponseSchema.safeParse({ ...response, status: "paid", created: false }).success).toBe(true);
    expect(CreateOrderResponseSchema.safeParse({ ...response, orderId: SEED_MENU_ID }).success).toBe(true);
  });

  it.each([
    ["알 수 없는 상태", { status: "shipping" }],
    ["64자 16진수가 아닌 토큰", { statusToken: "abc" }],
    ["정수가 아닌 픽업 번호", { pickupNumber: 1.5 }],
    ["음수 금액", { totalAmount: -1 }],
    ["UTC ISO가 아닌 시각", { createdAt: "어제" }],
    ["uuid가 아닌 주문 ID", { orderId: "abc" }],
  ])("%s는 거부한다", (_label, override) => {
    expect(CreateOrderResponseSchema.safeParse({ ...response, ...override }).success).toBe(false);
  });
});

describe("OrderStatusDtoSchema", () => {
  const status = {
    orderId: "22222222-2222-4222-8222-222222222222",
    pickupNumber: 151,
    status: "pending",
    paymentMethod: "transfer",
    totalAmount: 7000,
    items: [{ name: "씨앗호떡", quantity: 2, options: ["치즈"], lineTotal: 7000 }],
    createdAt: "2026-10-07T01:02:03.123Z",
    transferReportedAt: null,
    cancelRequestedAt: null,
    cancelRejectedAt: null,
    aheadCount: 0,
    canTransferReport: true,
    canCancelRequest: true,
  };
  const later = "2026-10-07T01:05:00.000Z";

  it("시각은 ISO UTC(…Z), 아직 없는 시각은 null이면 통과한다", () => {
    expect(OrderStatusDtoSchema.safeParse(status).success).toBe(true);
    expect(OrderStatusDtoSchema.safeParse({
      ...status, transferReportedAt: later, cancelRequestedAt: later, cancelRejectedAt: later,
    }).success).toBe(true);
  });

  it.each(["createdAt", "transferReportedAt", "cancelRequestedAt", "cancelRejectedAt"])(
    "%s가 DB 원문 표기(µs, +00:00)면 거부한다 — 응답 시각은 POST /api/orders처럼 …Z",
    (field) => {
      expect(OrderStatusDtoSchema.safeParse({ ...status, [field]: "2026-10-07T01:02:03.123456+00:00" }).success)
        .toBe(false);
    },
  );

  it("createdAt은 null일 수 없다", () => {
    expect(OrderStatusDtoSchema.safeParse({ ...status, createdAt: null }).success).toBe(false);
  });
});
