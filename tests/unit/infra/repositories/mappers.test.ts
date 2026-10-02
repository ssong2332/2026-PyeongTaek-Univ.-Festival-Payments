import { describe, expect, it } from "vitest";
import { toOrderByTokenResult } from "@/infra/repositories/mappers";

// orders 조회 결과(PostgREST embed: order_items → order_item_options) 모양의 가짜 행.
type OptionRow = { option_name_ko: string; option_name_en: string | null };
type ItemRow = {
  menu_name_ko: string;
  menu_name_en: string | null;
  quantity: number;
  line_total: number;
  sort_order: number;
  order_item_options?: OptionRow[];
};

function item(nameKo: string, nameEn: string | null, options: OptionRow[] = [], sortOrder = 0): ItemRow {
  return {
    menu_name_ko: nameKo,
    menu_name_en: nameEn,
    quantity: 1,
    line_total: 3000,
    sort_order: sortOrder,
    order_item_options: options,
  };
}

function option(nameKo: string, nameEn: string | null): OptionRow {
  return { option_name_ko: nameKo, option_name_en: nameEn };
}

function orderRow(locale: string, orderItems?: ItemRow[]) {
  return {
    id: "8f14e45f-ceea-467a-9575-5c7d3b1a9e21",
    pickup_number: 151,
    status: "pending",
    payment_method: "transfer",
    total_amount: 9000,
    locale,
    created_at: "2026-10-07T01:00:00.123456+00:00",
    transfer_reported_at: null,
    cancel_requested_at: null,
    cancel_rejected_at: null,
    status_token: "a".repeat(64),
    order_items: orderItems,
  };
}

const names = (data: unknown) =>
  toOrderByTokenResult(data).items.map(({ name, options }) => ({ name, options }));

describe("toOrderByTokenResult — 주문 locale 기준 이름 선택 (T-11)", () => {
  it("locale=en이면 메뉴·옵션 모두 영어 스냅샷 이름을 쓴다", () => {
    const row = orderRow("en", [item("씨앗호떡", "Seed Hotteok", [option("치즈", "Cheese")])]);

    expect(names(row)).toEqual([{ name: "Seed Hotteok", options: ["Cheese"] }]);
  });

  it("locale=en이어도 영어 스냅샷이 null이면 한국어로 폴백한다 — 메뉴·옵션 필드마다 따로", () => {
    const row = orderRow("en", [
      item("꿀호떡", null, [option("치즈", null)]),
      item("씨앗호떡", "Seed Hotteok", [option("견과류 많이", null), option("설탕 적게", "Less sugar")], 1),
    ]);

    expect(names(row)).toEqual([
      { name: "꿀호떡", options: ["치즈"] },
      { name: "Seed Hotteok", options: ["견과류 많이", "Less sugar"] },
    ]);
  });

  it("locale=en인데 영어 스냅샷이 빈 문자열이면 한국어 — 빈 이름을 내보내지 않는다(F-05)", () => {
    const row = orderRow("en", [item("꿀호떡", "", [option("치즈", "")])]);

    expect(names(row)).toEqual([{ name: "꿀호떡", options: ["치즈"] }]);
  });

  it("locale=ko면 영어 스냅샷이 있어도 한국어 이름을 쓴다", () => {
    const row = orderRow("ko", [item("씨앗호떡", "Seed Hotteok", [option("치즈", "Cheese")])]);

    expect(names(row)).toEqual([{ name: "씨앗호떡", options: ["치즈"] }]);
  });

  it("지원하지 않는 locale 값이면 한국어 이름을 쓴다", () => {
    const row = orderRow("ja", [item("씨앗호떡", "Seed Hotteok", [option("치즈", "Cheese")])]);

    expect(names(row)).toEqual([{ name: "씨앗호떡", options: ["치즈"] }]);
  });
});

describe("toOrderByTokenResult — 행 모양", () => {
  it("항목은 sort_order 순서로 정렬하고 옵션은 받은 순서를 유지한다", () => {
    const row = orderRow("ko", [
      item("셋째", null, [], 2),
      item("첫째", null, [option("나", null), option("가", null)], 0),
      item("둘째", null, [], 1),
    ]);

    expect(names(row)).toEqual([
      { name: "첫째", options: ["나", "가"] },
      { name: "둘째", options: [] },
      { name: "셋째", options: [] },
    ]);
  });

  it("order_items·order_item_options가 없으면 빈 배열이다", () => {
    const withoutOptions = { ...item("꿀호떡", null), order_item_options: undefined };

    expect(toOrderByTokenResult(orderRow("ko")).items).toEqual([]);
    expect(names(orderRow("ko", [withoutOptions]))).toEqual([{ name: "꿀호떡", options: [] }]);
  });

  it("필드를 명시 매핑한다 — status_token·locale 같은 목록 밖 컬럼은 결과에 없다", () => {
    const row = orderRow("ko", [{ ...item("씨앗호떡", null, [option("치즈", null)]), quantity: 2, line_total: 7000 }]);

    expect(toOrderByTokenResult(row)).toEqual({
      id: "8f14e45f-ceea-467a-9575-5c7d3b1a9e21",
      pickupNumber: 151,
      status: "pending",
      paymentMethod: "transfer",
      totalAmount: 9000,
      items: [{ name: "씨앗호떡", quantity: 2, options: ["치즈"], lineTotal: 7000 }],
      createdAt: "2026-10-07T01:00:00.123456+00:00",
      transferReportedAt: null,
      cancelRequestedAt: null,
      cancelRejectedAt: null,
    });
  });
});
