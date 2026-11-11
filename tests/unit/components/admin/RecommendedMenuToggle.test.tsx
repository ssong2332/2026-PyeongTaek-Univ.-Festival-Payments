// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecommendedMenuToggle } from "@/components/admin/RecommendedMenuToggle";

afterEach(cleanup);

describe("T-38 recommended menu control", () => {
    const menu = { id: "menu-1", name: "꿀호떡", isRecommended: false };

    it("requests the opposite saved value and reflects parent updates", async () => {
        const onSave = vi.fn(async () => {});
        const { rerender } = render(<RecommendedMenuToggle menu={menu} onSave={onSave} />);
        const toggle = screen.getByRole("switch", { name: "꿀호떡 추천 메뉴" });
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(toggle);
        await waitFor(() => expect(onSave).toHaveBeenCalledWith("menu-1", true));
        rerender(<RecommendedMenuToggle menu={{ ...menu, isRecommended: true }} onSave={onSave} />);
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(toggle);
        await waitFor(() => expect(onSave).toHaveBeenCalledWith("menu-1", false));
    });

    it("blocks duplicate saves while a request is pending", async () => {
        let finish!: () => void;
        const onSave = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
        render(<RecommendedMenuToggle menu={menu} onSave={onSave} />);
        const toggle = screen.getByRole("switch", { name: "꿀호떡 추천 메뉴" });
        fireEvent.click(toggle);
        fireEvent.click(toggle);
        expect(onSave).toHaveBeenCalledTimes(1);
        expect((toggle as HTMLButtonElement).disabled).toBe(true);
        finish();
        await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    });

    it("keeps the saved state and offers a retry after failure", async () => {
        const onSave = vi.fn().mockRejectedValueOnce(new Error("server error")).mockResolvedValueOnce(undefined);
        render(<RecommendedMenuToggle menu={menu} onSave={onSave} />);
        const toggle = screen.getByRole("switch", { name: "꿀호떡 추천 메뉴" });
        fireEvent.click(toggle);
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다"));
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(toggle);
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });
});
