import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn(() => ({})) }));

// 규칙은 서비스·저장소 테스트가 확인한다. 여기서는 경로 값 전달과 HTTP 응답 모양만 본다.
const reportTransfer = vi.fn();
vi.mock("@/services/transferReportService", () => ({ reportTransfer }));

const TOKEN = "a".repeat(64);

async function post(token: string) {
  const { POST } = await import("@/app/api/orders/[token]/transfer-report/route");
  const response = await POST(new Request(`http://localhost/api/orders/${token}/transfer-report`, { method: "POST" }), {
    params: Promise.resolve({ token }),
  });
  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  reportTransfer.mockReset();
});

describe("POST /api/orders/{token}/transfer-report", () => {
  it("경로의 토큰을 서비스에 넘기고 200 { transferReportedAt }", async () => {
    reportTransfer.mockResolvedValue({ transferReportedAt: "2026-10-07T03:00:00.000Z" });
    expect(await post(TOKEN)).toEqual({ status: 200, json: { transferReportedAt: "2026-10-07T03:00:00.000Z" } });
    expect(reportTransfer.mock.calls[0][0]).toBe(TOKEN);
    expect(reportTransfer.mock.calls[0][1].clock.now()).toBeInstanceOf(Date);
  });

  it("현금·결제대기 아님은 409 INVALID_TRANSITION 봉투", async () => {
    reportTransfer.mockRejectedValue(new AppError("INVALID_TRANSITION", 409));
    const { status, json } = await post(TOKEN);
    expect(status).toBe(409);
    expect(json.error.code).toBe("INVALID_TRANSITION");
  });

  it("없는 토큰은 404 NOT_FOUND 봉투", async () => {
    reportTransfer.mockRejectedValue(new AppError("NOT_FOUND", 404));
    const { status, json } = await post("zz");
    expect(status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("알 수 없는 오류는 500으로 숨긴다", async () => {
    reportTransfer.mockRejectedValue(new Error("db down"));
    const { status, json } = await post(TOKEN);
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("db down");
  });
});
