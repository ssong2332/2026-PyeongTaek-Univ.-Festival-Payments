import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock Supabase service client
vi.mock("@/infra/supabase/server", () => ({
    createServiceClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                like: vi.fn().mockResolvedValue({
                    data: [
                        { key: "transfer.bank_name", value: "토스뱅크" },
                        { key: "transfer.account_number", value: "1000-0000-0000" },
                        { key: "transfer.account_holder", value: "평택대" },
                        { key: "transfer.kakaopay_url_template", value: "" },
                        { key: "transfer.toss_url_template", value: "" },
                    ],
                    error: null,
                }),
            }),
        }),
    }),
}));

describe("GET /api/settings/transfer", () => {
    it("Route Handler가 정상적으로 TransferSettingsDto JSON(200)을 반환한다", async () => {
        const { GET } = await import("@/app/api/settings/transfer/route");
        const response = await GET();

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({
            configured: true,
            bankName: "토스뱅크",
            accountNumber: "1000-0000-0000",
            accountHolder: "평택대",
            kakaopayUrlTemplate: "",
            tossUrlTemplate: "",
        });
    });
});
