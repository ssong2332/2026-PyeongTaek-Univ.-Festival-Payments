import { describe, expect, it, vi } from "vitest";
import { ORDER_STATUSES } from "@/domain/order/status";
import { submitReview } from "@/services/reviewService";
import type { ReviewRepository } from "@/services/reviewPorts";

const token = "a".repeat(64);
const orderId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-10-07T03:00:00.000Z";
function repository(): ReviewRepository {
    return {
        findOrderByToken: vi.fn().mockResolvedValue({ id: orderId, status: "completed" }),
        insert: vi.fn().mockResolvedValue({ createdAt }),
    };
}
describe("submitReview", () => {
    it("완료 주문의 토큰으로 선택 텍스트 없이 제출", async () => {
        const repo = repository();
        expect(await submitReview(token, { rating: 4 }, repo)).toEqual({ createdAt });
        expect(repo.findOrderByToken).toHaveBeenCalledWith(token);
        expect(repo.insert).toHaveBeenCalledWith({ orderId, rating: 4, text: null });
    });
    it.each([1, 5])("별점 경계 %i와 이모지 200자를 저장", async (rating) => {
        const repo = repository();
        await submitReview(token, { rating, text: "😀".repeat(200) }, repo);
        expect(repo.insert).toHaveBeenCalledWith({ orderId, rating, text: "😀".repeat(200) });
    });
    it.each(ORDER_STATUSES.filter((status) => status !== "completed"))("%s 상태는 저장하지 않음", async (status) => {
        const repo = repository();
        vi.mocked(repo.findOrderByToken).mockResolvedValue({ id: orderId, status });
        await expect(submitReview(token, { rating: 4 }, repo)).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED", status: 409 });
        expect(repo.insert).not.toHaveBeenCalled();
    });
    it.each(["", "z".repeat(64), "a".repeat(63), "A".repeat(64)])("잘못된 토큰은 DB 접근 전에 404", async (invalidToken) => {
        const repo = repository();
        await expect(submitReview(invalidToken, { rating: 4 }, repo)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
        expect(repo.findOrderByToken).not.toHaveBeenCalled();
        expect(repo.insert).not.toHaveBeenCalled();
    });
    it("없는 토큰은 저장하지 않음", async () => {
        const repo = repository();
        vi.mocked(repo.findOrderByToken).mockResolvedValue(null);
        await expect(submitReview(token, { rating: 4 }, repo)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
        expect(repo.insert).not.toHaveBeenCalled();
    });
});
