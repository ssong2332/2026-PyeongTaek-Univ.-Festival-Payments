// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderStatusPage from "@/app/(customer)/orders/[token]/page";
import { readMyOrders, saveMyOrder } from "@/features/customer/myOrders";
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

  it("현금 주문에는 계좌 안내를 만들지 않고 계좌 정보도 조회하지 않는다 (T-31)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto()));
    await renderPage({ new: "1" });

    expect(screen.queryByRole("heading", { name: "계좌이체 안내" })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([`/api/orders/${TOKEN}`]);
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

  it("canCancelRequest가 false면 취소 요청 버튼이 없다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "cooking", canCancelRequest: false })));
    await renderPage();

    expect(screen.queryByRole("button", { name: /취소 요청/ })).toBeNull();
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

describe("/orders/[token] — 메뉴판 '내 주문' 정리 (#89)", () => {
  const OTHER = "f".repeat(64);
  const savedTokens = () => readMyOrders().map((order) => order.statusToken);

  beforeEach(() => {
    localStorage.clear();
    saveMyOrder({ statusToken: OTHER, pickupNumber: 7 });
    saveMyOrder({ statusToken: TOKEN, pickupNumber: 5 });
  });

  it("404면 '주문을 찾을 수 없습니다'와 함께 이 기기에서 그 주문을 지운다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "NOT_FOUND", message: "Resource not found." } }, 404));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문을 찾을 수 없습니다");
    expect(savedTokens()).toEqual([OTHER]);
  });

  it.each([
    ["cancelled", "주문이 취소됐어요"],
    ["refunded", "주문이 환불됐어요"],
    ["expired", "주문이 만료됐어요"],
  ] as const)("%s 안내를 보여 주고 이 기기에서 그 주문을 지운다", async (status, title) => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status, canCancelRequest: false })));
    await renderPage();

    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(savedTokens()).toEqual([OTHER]);
  });

  it("완료(completed)는 수령해야 하므로 남긴다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "completed", aheadCount: 0 })));
    await renderPage();

    expect(screen.getByText("완료")).toBeTruthy();
    expect(savedTokens()).toEqual([TOKEN, OTHER]);
  });

  it("저장되지 않은 주문을 완료 보기(?new=1)로 열어도 이 화면은 새로 저장하지 않는다", async () => {
    localStorage.clear();
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "pending" })));
    await renderPage({ new: "1" });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("주문이 접수됐어요!");
    expect(savedTokens()).toEqual([]);
  });
});

describe("/orders/[token] — 계좌이체 안내(T-31, F-42)·[송금했어요](T-32, F-43)", () => {
  const SETTINGS = { configured: true, bankName: "테스트은행", accountNumber: "000-0000-0000", accountHolder: "테스트예금주" };
  const REPORT_URL = `/api/orders/${TOKEN}/transfer-report`;
  const transferOrder = (overrides: Partial<OrderStatusDto> = {}) =>
    orderDto({ paymentMethod: "transfer", canTransferReport: true, canCancelRequest: true, ...overrides });

  type Route = (init?: RequestInit) => Response | Promise<Response>;
  function routeFetch(routes: { order: Route; settings?: Route; report?: Route }) {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/settings/transfer") return (routes.settings ?? (() => jsonResponse(SETTINGS)))(init);
      if (url === REPORT_URL) return routes.report ? routes.report(init) : jsonResponse({}, 500);
      return routes.order(init);
    });
  }
  const reportCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === REPORT_URL);

  it("완료 보기: 은행·계좌번호·예금주·금액, [계좌번호 복사], 입금자명 안내, [송금했어요]를 보이고 현금 안내는 없다", async () => {
    routeFetch({ order: () => jsonResponse(transferOrder()) });
    await renderPage({ new: "1" });

    const guide = screen.getByRole("region", { name: "계좌이체 안내" });
    expect(within(guide).getByText("테스트은행")).toBeTruthy();
    expect(within(guide).getByText("000-0000-0000")).toBeTruthy();
    expect(within(guide).getByText("테스트예금주")).toBeTruthy();
    expect(within(guide).getByText("13,500원")).toBeTruthy();
    expect(guide.textContent).toContain("입금자명은 픽업 번호 005로 적어 주세요.");
    expect(within(guide).getByRole("button", { name: "계좌번호 복사" })).toBeTruthy();
    expect(within(guide).getByRole("button", { name: "송금했어요" })).toBeTruthy();
    expect(screen.queryByText("부스에서 현금으로 결제해 주세요.")).toBeNull();
  });

  it("현황 보기에도 같은 안내가 보인다", async () => {
    routeFetch({ order: () => jsonResponse(transferOrder()) });
    await renderPage();

    expect(screen.getByRole("heading", { name: "진행 상황" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "계좌이체 안내" })).getByText("000-0000-0000")).toBeTruthy();
  });

  it("입금이 확인되면(paid) 계좌 안내를 거둔다", async () => {
    routeFetch({ order: () => jsonResponse(transferOrder({ status: "paid", canTransferReport: false })) });
    await renderPage();

    expect(screen.queryByRole("region", { name: "계좌이체 안내" })).toBeNull();
  });

  it("계좌 설정이 비어 있으면 '준비 중' 안내만 보이고 송금 버튼은 없다", async () => {
    routeFetch({
      order: () => jsonResponse(transferOrder()),
      settings: () => jsonResponse({ configured: false, bankName: "", accountNumber: "", accountHolder: "" }),
    });
    await renderPage({ new: "1" });

    const guide = screen.getByRole("region", { name: "계좌이체 안내" });
    expect(guide.textContent).toContain("계좌 정보를 준비 중이에요");
    expect(within(guide).queryByRole("button", { name: "송금했어요" })).toBeNull();
  });

  it("계좌 정보를 못 불러오면 '다시 시도'로 다시 조회한다", async () => {
    let settingsCalls = 0;
    routeFetch({
      order: () => jsonResponse(transferOrder()),
      settings: () => (++settingsCalls === 1 ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "x" } }, 400) : jsonResponse(SETTINGS)),
    });
    await renderPage({ new: "1" });

    const guide = screen.getByRole("region", { name: "계좌이체 안내" });
    expect(guide.textContent).toContain("계좌 정보를 불러오지 못했어요");
    fireEvent.click(within(guide).getByRole("button", { name: "다시 시도" }));
    await flush();
    expect(within(guide).getByText("000-0000-0000")).toBeTruthy();
  });

  it("[계좌번호 복사]는 클립보드에 계좌번호를 쓰고 '복사했어요'를 2초 보인다", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    routeFetch({ order: () => jsonResponse(transferOrder()) });
    await renderPage({ new: "1" });

    fireEvent.click(screen.getByRole("button", { name: "계좌번호 복사" }));
    await flush();
    expect(writeText).toHaveBeenCalledWith("000-0000-0000");
    expect(screen.getByText("복사했어요")).toBeTruthy();
    await flush(2_000);
    expect(screen.queryByText("복사했어요")).toBeNull();
  });

  it("클립보드를 못 쓰면 길게 눌러 복사하라고 안내한다", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    routeFetch({ order: () => jsonResponse(transferOrder()) });
    await renderPage({ new: "1" });

    fireEvent.click(screen.getByRole("button", { name: "계좌번호 복사" }));
    await flush();
    expect(screen.getByText("계좌번호를 길게 눌러 복사해 주세요")).toBeTruthy();
  });

  it("[송금했어요]: POST 후 '송금 신고 완료 HH:MM'(KST)으로 바뀌고 주문을 바로 다시 읽는다", async () => {
    let reported = false;
    routeFetch({
      order: () =>
        jsonResponse(
          transferOrder(reported ? { canTransferReport: false, transferReportedAt: "2026-10-07T03:05:00.000Z" } : {}),
        ),
      report: (init) => {
        expect(init?.method).toBe("POST");
        reported = true;
        return jsonResponse({ transferReportedAt: "2026-10-07T03:05:00.000Z" });
      },
    });
    await renderPage({ new: "1" });
    const orderCallsBefore = fetchMock.mock.calls.filter(([url]) => String(url) === `/api/orders/${TOKEN}`).length;

    fireEvent.click(screen.getByRole("button", { name: "송금했어요" }));
    await flush();

    expect(reportCalls()).toHaveLength(1);
    expect(screen.getByText("송금 신고 완료 12:05")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "송금했어요" })).toBeNull();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === `/api/orders/${TOKEN}`).length).toBe(orderCallsBefore + 1);
  });

  it("이미 신고된 주문은 버튼 대신 신고 시각을 보인다", async () => {
    routeFetch({
      order: () => jsonResponse(transferOrder({ canTransferReport: false, transferReportedAt: "2026-10-07T03:05:00.000Z" })),
    });
    await renderPage();

    expect(screen.getByText("송금 신고 완료 12:05")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "송금했어요" })).toBeNull();
  });

  it("신고 중에는 버튼을 잠가 연타해도 한 번만 보낸다", async () => {
    routeFetch({ order: () => jsonResponse(transferOrder()), report: () => new Promise<Response>(() => {}) });
    await renderPage({ new: "1" });

    const button = screen.getByRole("button", { name: "송금했어요" }) as HTMLButtonElement;
    fireEvent.click(button);
    await flush();
    const locked = screen.getByRole("button", { name: "신고하는 중…" }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    fireEvent.click(locked);
    expect(reportCalls()).toHaveLength(1);
  });

  it("409(상태가 바뀜)면 안내를 보이고 주문을 다시 읽는다", async () => {
    routeFetch({
      order: () => jsonResponse(transferOrder()),
      report: () => jsonResponse({ error: { code: "INVALID_TRANSITION", message: "x" } }, 409),
    });
    await renderPage({ new: "1" });

    fireEvent.click(screen.getByRole("button", { name: "송금했어요" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("주문 상태가 바뀌었어요");
  });

  it("그 밖의 실패면 다시 누르라고 안내하고 버튼을 남긴다", async () => {
    routeFetch({
      order: () => jsonResponse(transferOrder()),
      report: () => jsonResponse({ error: { code: "VALIDATION_ERROR", message: "x" } }, 400),
    });
    await renderPage({ new: "1" });

    fireEvent.click(screen.getByRole("button", { name: "송금했어요" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("신고하지 못했어요");
    expect(screen.getByRole("button", { name: "송금했어요" })).toBeTruthy();
  });
});

describe("/orders/[token] — 고객 취소 요청(T-35, F-45)", () => {
  const CANCEL_URL = `/api/orders/${TOKEN}/cancel-request`;
  const cancelCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === CANCEL_URL);

  it("[주문 취소 요청] → 한 번 더 확인 → POST 후 '취소 요청됨 HH:MM'(KST)", async () => {
    let requested = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === CANCEL_URL) {
        expect(init?.method).toBe("POST");
        requested = true;
        return jsonResponse({ cancelRequestedAt: "2026-10-07T03:10:00.000Z" });
      }
      return jsonResponse(orderDto(requested ? { canCancelRequest: false, cancelRequestedAt: "2026-10-07T03:10:00.000Z" } : {}));
    });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "주문 취소 요청" }));
    await flush(100);
    expect(screen.getByText(/정말 취소를 요청할까요/)).toBeTruthy();
    expect(cancelCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "취소 요청하기" }));
    await flush();

    expect(cancelCalls()).toHaveLength(1);
    expect(screen.getByText("취소 요청됨 12:10")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /취소 요청/ })).toBeNull();
  });

  it("'그만두기'를 누르면 요청하지 않고 돌아간다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto()));
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "주문 취소 요청" }));
    await flush(100);
    fireEvent.click(screen.getByRole("button", { name: "그만두기" }));
    await flush(100);
    expect(cancelCalls()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "주문 취소 요청" })).toBeTruthy();
  });

  it("거절된 요청이면 '취소 요청이 거절됐어요'를 보이고 버튼이 없다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(orderDto({ canCancelRequest: false, cancelRequestedAt: "2026-10-07T03:10:00.000Z", cancelRejectedAt: "2026-10-07T03:12:00.000Z" })),
    );
    await renderPage();

    expect(screen.getByRole("heading", { name: "취소 요청이 거절됐어요" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /취소 요청/ })).toBeNull();
  });

  it("409(조리 시작 등)면 요청할 수 없다고 안내한다", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input) === CANCEL_URL
        ? jsonResponse({ error: { code: "CANCEL_REQUEST_NOT_ALLOWED", message: "x" } }, 409)
        : jsonResponse(orderDto()),
    );
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "주문 취소 요청" }));
    await flush(100);
    fireEvent.click(screen.getByRole("button", { name: "취소 요청하기" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("지금은 취소를 요청할 수 없어요");
  });
});

describe("/orders/[token] — 후기·별점(T-41, F-37)", () => {
  const REVIEW_URL = `/api/orders/${TOKEN}/reviews`;
  const completed = () => jsonResponse(orderDto({ status: "completed", aheadCount: 0, canCancelRequest: false }));

  beforeEach(() => localStorage.clear());

  it("완료 주문에만 폼이 있고, 별점을 고르기 전에는 보낼 수 없다", async () => {
    fetchMock.mockImplementation(async () => completed());
    await renderPage();

    expect(screen.getByRole("heading", { name: "호떡 맛은 어떠셨어요?" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /후기 남기기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("조리중 주문에는 후기 폼이 없다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderDto({ status: "cooking" })));
    await renderPage();
    expect(screen.queryByRole("heading", { name: "호떡 맛은 어떠셨어요?" })).toBeNull();
  });

  it("별점 4 + 한 줄 후기로 보내면 rating·text를 POST하고 '후기가 등록되었습니다'로 바뀐다", async () => {
    let body: unknown = null;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === REVIEW_URL) {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ createdAt: "2026-10-07T03:30:00.000Z" }, 201);
      }
      return completed();
    });
    await renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "4점" }));
    fireEvent.change(screen.getByPlaceholderText(/한 줄 후기/), { target: { value: "  쫀득해요  " } });
    fireEvent.click(screen.getByRole("button", { name: /후기 남기기/ }));
    await flush();

    expect(body).toEqual({ rating: 4, text: "쫀득해요" });
    expect(screen.getByRole("heading", { name: "후기가 등록되었습니다" })).toBeTruthy();
  });

  it("후기 없이 별점만 보내면 text는 null", async () => {
    let body: unknown = null;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === REVIEW_URL) {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ createdAt: "2026-10-07T03:30:00.000Z" }, 201);
      }
      return completed();
    });
    await renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "5점" }));
    fireEvent.click(screen.getByRole("button", { name: /후기 남기기/ }));
    await flush();
    expect(body).toEqual({ rating: 5, text: null });
  });

  it("200자를 넘으면 글자 수를 경고하고 보낼 수 없다", async () => {
    fetchMock.mockImplementation(async () => completed());
    await renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "3점" }));
    fireEvent.change(screen.getByPlaceholderText(/한 줄 후기/), { target: { value: "가".repeat(201) } });
    expect(screen.getByText("201/200")).toBeTruthy();
    expect((screen.getByRole("button", { name: /후기 남기기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("이미 낸 후기(409 REVIEW_ALREADY_SUBMITTED)면 등록됨으로 보이고, 다시 열어도 폼이 없다", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input) === REVIEW_URL ? jsonResponse({ error: { code: "REVIEW_ALREADY_SUBMITTED", message: "x" } }, 409) : completed(),
    );
    await renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "5점" }));
    fireEvent.click(screen.getByRole("button", { name: /후기 남기기/ }));
    await flush();
    expect(screen.getByRole("heading", { name: "후기가 등록되었습니다" })).toBeTruthy();

    cleanup();
    await renderPage();
    expect(screen.getByRole("heading", { name: "후기가 등록되었습니다" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /후기 남기기/ })).toBeNull();
  });
});
