import { describe, expect, it, vi } from "vitest";
import { createSupabaseRateLimitRepository } from "@/infra/repositories/supabaseRateLimitRepository";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("supabaseRateLimitRepository", () => {
  it.each([null, undefined, 0, 1, "", "false", [], {}].map((data) => ({ data })))(
    "boolean이 아닌 RPC 결과 $data는 INTERNAL_ERROR로 처리한다",
    async ({ data }) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const repo = createSupabaseRateLimitRepository({ rpc } as unknown as SupabaseClient);
      await expect(repo.consume("order_create", "testkey", 100, 60))
        .rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    },
  );
  it("consume_rate_limit RPC를 올바른 인자로 호출하고 boolean 결과를 반환한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    const repo = createSupabaseRateLimitRepository(client);
    const result = await repo.consume("order_create", "testkey", 100, 60);

    expect(result).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_scope: "order_create",
      p_key: "testkey",
      p_limit: 100,
      p_window_seconds: 60,
    });
  });

  it("now 인자가 주어지면 p_now를 ISO 문자열로 전달한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    const repo = createSupabaseRateLimitRepository(client);
    const now = new Date("2026-09-29T12:00:00.000Z");
    const result = await repo.consume("order_create", "testkey", 100, 60, now);

    expect(result).toBe(false);
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_scope: "order_create",
      p_key: "testkey",
      p_limit: 100,
      p_window_seconds: 60,
      p_now: "2026-09-29T12:00:00.000Z",
    });
  });

  it("RPC 오류 시 예외를 던진다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("RPC error") });
    const client = { rpc } as unknown as SupabaseClient;

    const repo = createSupabaseRateLimitRepository(client);
    await expect(repo.consume("order_create", "testkey", 100, 60)).rejects.toThrow("RPC error");
  });
});
