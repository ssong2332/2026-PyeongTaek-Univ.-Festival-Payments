import { describe, expect, it } from "vitest";
import { CreateOrderRequestSchema } from "@/lib/dto/order";

const MENU_ID = "33333333-3333-4333-8333-333333333333";
const OPTION_ID = "44444444-4444-4444-8444-444444444444";

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

  it("지원하지 않는 언어는 거부한다", () => {
    expect(CreateOrderRequestSchema.safeParse(request({ locale: "en" })).success).toBe(true);
    expect(CreateOrderRequestSchema.safeParse(request({ locale: "jp" })).success).toBe(false);
  });
});
