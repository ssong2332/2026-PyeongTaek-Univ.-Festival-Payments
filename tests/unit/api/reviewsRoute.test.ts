import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
const repo = vi.hoisted(() => ({ findOrderByToken: vi.fn(), insert: vi.fn() }));
vi.mock("@/infra/repositories/supabaseReviewRepository", () => ({ createSupabaseReviewRepository: () => repo }));
import { POST } from "@/app/api/orders/[token]/reviews/route";
import { createServiceClient } from "@/infra/supabase/server";
const token = "a".repeat(64);
async function post(value: string, body: string) {
    return POST(new Request(`http://localhost/api/orders/${value}/reviews`, { method: "POST", body }), { params: Promise.resolve({ token: value }) });
}
beforeEach(() => vi.clearAllMocks());
it.each(["{", "null", JSON.stringify({ rating: 6 }), JSON.stringify({ rating: 4, orderId: "spoofed" })])("잘못된 입력은 DB 클라이언트 생성 전에 400: %#", async (body) => {
    const response = await post(token, body);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(repo.findOrderByToken).not.toHaveBeenCalled();
});
it("토큰 형식 오류는 본문 파싱·DB 생성 전에 404", async () => {
    const response = await post("wrong", "{");
    expect(response.status).toBe(404);
    expect(createServiceClient).not.toHaveBeenCalled();
});
it("DB 장애 정보와 주문 토큰·후기 텍스트는 500 응답에 노출하지 않음", async () => {
    repo.findOrderByToken.mockRejectedValue(new Error("private database detail"));
    const response = await post(token, JSON.stringify({ rating: 4, text: "private text" }));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." } });
});
