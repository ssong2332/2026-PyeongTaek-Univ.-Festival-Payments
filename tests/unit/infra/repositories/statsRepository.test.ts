import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { loadStats } from "@/infra/repositories/statsRepository";

it("requests the database aggregate for the selected date", async () => {
    const summary = { date: "all", sales: 25000, byMenu: [] };
    const rpc = vi.fn().mockResolvedValue({ data: summary, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await loadStats(client, "all")).toBe(summary);
    expect(rpc).toHaveBeenCalledWith("get_stats", { p_date: "all" });
});

it("maps database failures to an internal error", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "private" } }) } as unknown as SupabaseClient;
    await expect(loadStats(client, "all")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
});
