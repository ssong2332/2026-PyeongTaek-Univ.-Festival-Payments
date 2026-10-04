import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { SupabaseSweepRepository } from "@/infra/repositories/supabaseSweepRepository";

describe("SupabaseSweepRepository diagnostics", () => {
    afterEach(() => vi.restoreAllMocks());

    it("DB 오류는 안전한 코드만 로그에 남기고 API용 내부 오류로 변환한다", async () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const rpc = vi.fn().mockResolvedValue({
            data: null,
            error: { code: "P0001", message: "private account 123-456 caused failure" },
        });
        const repository = new SupabaseSweepRepository({ rpc } as unknown as SupabaseClient);

        await expect(repository.sweep()).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
        const line = logged.mock.calls[0][0] as string;
        expect(JSON.parse(line)).toMatchObject({ event: "order.sweep.rpc_failed", code: "P0001" });
        expect(line).not.toContain("private account");
        expect(line).not.toContain("123-456");
    });

    it("예상 밖 결과와 RPC 예외를 구분하되 원문은 로그에 남기지 않는다", async () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: { expired: -1, completed: 0 }, error: null })
            .mockRejectedValueOnce(new Error("private database URL"));
        const repository = new SupabaseSweepRepository({ rpc } as unknown as SupabaseClient);

        await expect(repository.sweep()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
        await expect(repository.sweep()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
        expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
            event: "order.sweep.invalid_result", code: "INVALID_RPC_RESULT",
        });
        expect(JSON.parse(logged.mock.calls[1][0] as string)).toMatchObject({
            event: "order.sweep.rpc_threw", code: "RPC_ERROR",
        });
        expect(logged.mock.calls.flat().join(" ")).not.toContain("private database URL");
    });

    it("잘못된 스윕 설정은 값 노출 없이 원인 키를 식별한다", async () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const rpc = vi.fn().mockResolvedValue({
            data: null,
            error: { code: "P0001", message: "payment.expire_minutes must be between 1 and 120" },
        });
        const repository = new SupabaseSweepRepository({ rpc } as unknown as SupabaseClient);

        await expect(repository.sweep()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
        expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
            event: "order.sweep.rpc_failed", code: "INVALID_PAYMENT_EXPIRE_MINUTES",
        });
    });
});
