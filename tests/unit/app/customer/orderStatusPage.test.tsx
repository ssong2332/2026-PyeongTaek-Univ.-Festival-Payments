// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderStatusPage from "@/app/(customer)/orders/[token]/page";
import type { OrderStatusDto } from "@/lib/dto/order";

const TOKEN = "0123456789abcdef".repeat(4);

function orderDto(overrides: Partial<OrderStatusDto> = {}): OrderStatusDto {
  return {
    orderId: "11111111-1111-1111-1111-111111111111",
    pickupNumber: 5,
    status: "pending",
    paymentMethod: "cash",
    totalAmount: 13500,
    items: [
      { name: "치즈 호떡", quantity: 2, options: ["견과류 추가", "시럽 많이"], lineTotal: 9000 },
      { name: "씨앗 호떡", quantity: 1, options: [], lineTotal: 4500 },
    ],
    createdAt: "2026-10-07T03:00:00.000Z",
    transferReportedAt: null,
    cancelRequestedAt: null,
    cancelRejectedAt: null,
    aheadCount: 2,
    canTransferReport: false,
    canCancelRequest: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const fetchMock = vi.fn<typeof fetch>();

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

type Search = Record<string, string | string[] | undefined>;

async function renderPage(search: Search = {}, token = TOKEN) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <OrderStatusPage params={Promise.resolve({ token })} searchParams={Promise.resolve(search)} />
      </Suspense>,
    );
  });
  await flush();
}

function pickupRegionText(): string | null {
  return screen.getByRole("region", { name: "픽업 번호" }).textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/orders/[token]?new=1 — 주문 완료 보기 (T-09, F-09)", () => {
  it("제목, 3자리 픽업 번호, 금액, 결제 방법, 현금 결제 안내, 메뉴 링크를 보여준다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto()));
    await renderPage({ new: "1" });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문이 접수됐어요!");
    expect(pickupRegionText()).toContain("005");
    expect(screen.getByText("13,500원")).toBeTruthy();
    expect(screen.getByText("결제 방법")).toBeTruthy();
    expect(screen.getByText("현금")).toBeTruthy();
    expect(screen.getByText("부스에서 현금으로 결제해 주세요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /주문 현황 보기/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "메뉴로 돌아가기" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("heading", { name: "진행 상황" })).toBeNull();
  });

  it("'주문 현황 보기'를 누르면 다시 조회하지 않고 현황 보기로 바뀌며, 폴링은 이어지고 '뒤로'로 돌아올 수 있다", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(orderDto()));
    await renderPage({ new: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /주문 현황 보기/ }));

    expect(screen.getByRole("heading", { name: "진행 상황" })).toBeTruthy();
    expect(pickupRegionText()).toContain("005");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flush(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문이 접수됐어요!");
  });

  it("계좌이체 주문이면 '계좌이체'만 보이고 현금 안내·계좌 안내·송금 버튼은 없다 (T-31·T-32는 P2)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ paymentMethod: "transfer", canTransferReport: true })));
    await renderPage({ new: "1" });

    expect(screen.getByText("계좌이체")).toBeTruthy();
    expect(screen.queryByText("부스에서 현금으로 결제해 주세요.")).toBeNull();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["주문 현황 보기 →"]);
  });

  it("현금 주문이라도 이미 결제가 확인됐으면(cooking) 현금 결제 안내를 숨긴다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "cooking" })));
    await renderPage({ new: "1" });

    expect(screen.getByText("현금")).toBeTruthy();
    expect(screen.queryByText("부스에서 현금으로 결제해 주세요.")).toBeNull();
  });

  it.each([
    ["new 없음", {}],
    ["new=0", { new: "0" }],
    ["new 빈 값", { new: "" }],
    ["new 두 번", { new: ["1", "1"] }],
  ] as [string, Search][])("%s이면 현황 보기로 열고 '뒤로' 버튼이 없다", async (_label, search) => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto()));
    await renderPage(search);

    expect(screen.queryByText("주문이 접수됐어요!")).toBeNull();
    expect(screen.getByRole("heading", { name: "진행 상황" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "뒤로" })).toBeNull();
  });
});

describe("/orders/[token] — 주문 현황 보기 (T-11, F-10·F-11·F-14)", () => {
  it("헤더(3자리 픽업 번호·상태·내 앞 대기), 진행 상황, 주문 내역(이름·옵션·수량·금액·합계·결제수단)을 보여준다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "cooking", aheadCount: 2 })));
    await renderPage();

    expect(pickupRegionText()).toContain("005");
    expect(screen.getByText("조리중")).toBeTruthy();
    expect(screen.getByText("내 앞 대기 2건")).toBeTruthy();

    const current = screen.getAllByRole("listitem").find((item) => item.getAttribute("aria-current") === "step");
    expect(current?.textContent).toContain("호떡 굽는 중");

    const summary = screen.getByRole("region", { name: "주문 내역" });
    const lines = within(summary).getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("치즈 호떡");
    expect(lines[0].textContent).toContain("× 2");
    expect(lines[0].textContent).toContain("견과류 추가, 시럽 많이");
    expect(lines[0].textContent).toContain("9,000원");
    expect(lines[1].textContent).toContain("씨앗 호떡");
    expect(lines[1].textContent).toContain("× 1");
    expect(lines[1].textContent).toContain("4,500원");
    expect(within(summary).getByText("13,500원")).toBeTruthy();
    expect(within(summary).getByText("현금")).toBeTruthy();
  });

  it("내 앞 대기가 0건이면 '대기 없음'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "pending", aheadCount: 0 })));
    await renderPage();

    expect(screen.getByText("대기 없음")).toBeTruthy();
    expect(screen.queryByText(/내 앞 대기/)).toBeNull();
  });

  it("완료(completed)면 대기 건수를 숨기고 4단계 '완성! 수령해주세요'가 현재 단계", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "completed", aheadCount: 0 })));
    await renderPage();

    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.queryByText(/내 앞 대기|대기 없음/)).toBeNull();
    const current = screen.getAllByRole("listitem").find((item) => item.getAttribute("aria-current") === "step");
    expect(current?.textContent).toContain("완성! 수령해주세요");
  });

  it.each([
    ["cancelled", "취소", "주문이 취소됐어요"],
    ["refunded", "환불", "주문이 환불됐어요"],
    ["expired", "만료", "주문이 만료됐어요"],
  ] as const)("%s면 스테퍼 대신 상태 안내 카드('%s')를 보여 주고 대기 건수를 숨긴다", async (status, label, title) => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status, aheadCount: 4, canCancelRequest: false })));
    await renderPage();

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "진행 상황" })).toBeNull();
    expect(screen.queryByText(/내 앞 대기|대기 없음/)).toBeNull();
  });

  it("canTransferReport·canCancelRequest가 true여도 송금·취소 요청·직원 호출 버튼을 만들지 않는다 (P1 범위)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ paymentMethod: "transfer", canTransferReport: true, canCancelRequest: true })));
    await renderPage();

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "메뉴로 돌아가기" }).getAttribute("href")).toBe("/");
  });
});

describe("/orders/[token] — 로딩·없음·오류 (PRD 화면 표)", () => {
  it("조회 중에는 불러오는 중 안내를 보여준다", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    await renderPage();

    expect(screen.getByRole("status").textContent).toContain("주문 정보를 불러오는 중이에요");
  });

  it("404면 '주문을 찾을 수 없습니다'와 메뉴 링크", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "NOT_FOUND", message: "Resource not found." } }, 404));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문을 찾을 수 없습니다");
    expect(screen.getByRole("link", { name: "메뉴로 돌아가기" }).getAttribute("href")).toBe("/");
  });

  it("토큰 형식이 틀리면(abc) 조회 없이 '주문을 찾을 수 없습니다'", async () => {
    await renderPage({ new: "1" }, "abc");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문을 찾을 수 없습니다");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("500이면 오류 안내와 '다시 시도' — 누르면 바로 다시 조회해 주문을 보여준다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "INTERNAL_ERROR", message: "x" } }, 500))
      .mockResolvedValueOnce(jsonResponse(orderDto()));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문 정보를 불러오지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pickupRegionText()).toContain("005");
  });

  it("주문을 받은 뒤 갱신이 실패하면 픽업 번호를 그대로 두고 안내만 띄우며, 다음 성공에서 안내를 거둔다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "cooking" })))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "completed" })));
    await renderPage();

    await flush(5_000);
    expect(pickupRegionText()).toContain("005");
    expect(screen.getByText(/최신 상태를 불러오지 못했어요/)).toBeTruthy();

    await flush(5_000);
    expect(screen.queryByText(/최신 상태를 불러오지 못했어요/)).toBeNull();
    expect(screen.getByText("완료")).toBeTruthy();
  });
});
