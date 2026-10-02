// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderStatus } from "@/features/customer/useOrderStatus";
import type { OrderStatusDto } from "@/lib/dto/order";

const TOKEN = "0123456789abcdef".repeat(4);

function orderDto(overrides: Partial<OrderStatusDto> = {}): OrderStatusDto {
  return {
    orderId: "11111111-1111-1111-1111-111111111111",
    pickupNumber: 42,
    status: "cooking",
    paymentMethod: "cash",
    totalAmount: 12000,
    items: [{ name: "떡볶이", quantity: 2, options: ["매운맛"], lineTotal: 12000 }],
    createdAt: "2026-10-07T03:00:00.000Z",
    transferReportedAt: null,
    cancelRequestedAt: null,
    cancelRejectedAt: null,
    aheadCount: 3,
    canTransferReport: false,
    canCancelRequest: false,
    ...overrides,
  };
}

// fetchJson은 ok·status·json()만 읽는다 — 실제 Response 대신 이 셋만 가진 값으로 응답을 고정한다.
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function notFoundResponse(): Response {
  return jsonResponse({ error: { code: "NOT_FOUND", message: "Resource not found." } }, 404);
}

function internalErrorResponse(): Response {
  return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." } }, 500);
}

const fetchMock = vi.fn<typeof fetch>();

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
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

describe("useOrderStatus — 첫 조회", () => {
  it("마운트 직후 loading이고, GET /api/orders/{token} 응답을 받으면 ready + 주문을 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(orderDto()));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    expect(result.current.status).toBe("loading");
    expect(result.current.order).toBeNull();

    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/orders/${TOKEN}`);
    expect(fetchMock.mock.calls[0][1]?.cache).toBe("no-store");
    expect(result.current.status).toBe("ready");
    expect(result.current.order?.pickupNumber).toBe(42);
    expect(result.current.order?.status).toBe("cooking");
    expect(result.current.refreshFailed).toBe(false);
  });

  it.each([
    ["3자", "abc"],
    ["빈 문자열", ""],
    ["63자", TOKEN.slice(1)],
    ["65자", `${TOKEN}0`],
    ["대문자 16진수", TOKEN.toUpperCase()],
    ["16진수 밖 문자", `${TOKEN.slice(1)}g`],
  ])("토큰 형식이 틀리면(%s) 서버에 묻지 않고 바로 notFound", async (_label, token) => {
    const { result } = renderHook(() => useOrderStatus(token));

    expect(result.current.status).toBe("notFound");
    await advance(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("notFound");
  });

  it("404면 notFound로 바꾸고 폴링을 멈춘다", async () => {
    fetchMock.mockResolvedValue(notFoundResponse());

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    expect(result.current.status).toBe("notFound");
    expect(result.current.order).toBeNull();

    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("500이면 error이고, 폴링은 계속해 다음 5초 조회가 성공하면 ready로 돌아온다", async () => {
    fetchMock
      .mockResolvedValueOnce(internalErrorResponse())
      .mockResolvedValueOnce(jsonResponse(orderDto()));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    expect(result.current.status).toBe("error");
    expect(result.current.order).toBeNull();

    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
    expect(result.current.order?.pickupNumber).toBe(42);
  });

  it("네트워크 오류면 error이고, retry()는 5초를 기다리지 않고 바로 다시 조회한다", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(orderDto()));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    expect(result.current.status).toBe("error");

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
  });

  it("200이어도 응답이 OrderStatusDto 계약과 다르면 error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ pickupNumber: "42" }));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);

    expect(result.current.status).toBe("error");
    expect(result.current.order).toBeNull();
  });
});

describe("useOrderStatus — 5초 폴링", () => {
  it("5초 간격으로 다시 조회하고(4999ms에는 아직 아님) 바뀐 상태를 반영한다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "paid", aheadCount: 2 })))
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "cooking", aheadCount: 1 })));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    expect(result.current.order?.status).toBe("paid");

    await advance(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.order?.status).toBe("cooking");
    expect(result.current.order?.aheadCount).toBe(1);
  });

  it.each(["pending", "paid", "cooking"] as const)("대기 상태(%s)면 폴링을 계속한다 — 15초 뒤 총 4회", async (status) => {
    fetchMock.mockImplementation(async () => jsonResponse(orderDto({ status })));

    renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    await advance(15_000);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each(["completed", "cancelled", "refunded", "expired"] as const)(
    "종료 상태(%s)를 받으면 폴링을 멈춘다",
    async (status) => {
      fetchMock.mockImplementation(async () => jsonResponse(orderDto({ status })));

      const { result } = renderHook(() => useOrderStatus(TOKEN));
      await advance(0);
      await advance(30_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("ready");
      expect(result.current.order?.status).toBe(status);
    },
  );

  it("폴링 중 조리중 → 완료로 바뀌면 그 뒤로는 조회하지 않는다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "cooking" })))
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "completed", aheadCount: 0 })));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    await advance(5_000);
    expect(result.current.order?.status).toBe("completed");

    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ready 뒤 조회가 실패하면 마지막 주문을 유지한 채 refreshFailed=true, 다음 성공에서 false로 돌아온다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "cooking" })))
      .mockResolvedValueOnce(internalErrorResponse())
      .mockResolvedValueOnce(jsonResponse(orderDto({ status: "completed" })));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    await advance(5_000);

    expect(result.current.status).toBe("ready");
    expect(result.current.order?.pickupNumber).toBe(42);
    expect(result.current.order?.status).toBe("cooking");
    expect(result.current.refreshFailed).toBe(true);

    await advance(5_000);
    expect(result.current.refreshFailed).toBe(false);
    expect(result.current.order?.status).toBe("completed");
  });

  it("ready 뒤 404가 오면 notFound로 바꾸고 폴링을 멈춘다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orderDto()))
      .mockResolvedValue(notFoundResponse());

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    await advance(5_000);
    expect(result.current.status).toBe("notFound");
    expect(result.current.order).toBeNull();

    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("앞 요청이 끝나지 않았으면 다음 틱과 retry()는 요청을 겹쳐 보내지 않는다", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    const { result } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    act(() => result.current.retry());
    await advance(15_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("loading");
  });

  it("언마운트하면 폴링을 멈추고, 그때 진행 중이던 응답은 무시한다", async () => {
    let resolveSecond: (response: Response) => void = () => {};
    fetchMock
      .mockResolvedValueOnce(jsonResponse(orderDto()))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useOrderStatus(TOKEN));
    await advance(0);
    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();
    resolveSecond(jsonResponse(orderDto({ status: "completed" })));
    await advance(30_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.order?.status).toBe("cooking");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
