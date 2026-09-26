// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPanel, type SettingsApi } from "@/components/admin/SettingsPanel";

afterEach(cleanup);

function api(settings: Record<string, string> = {}): SettingsApi {
    return {
        load: vi.fn(async () => settings),
        save: vi.fn(async (changes: Record<string, string>) => ({ ...settings, ...changes })),
    };
}

describe("T-19 자동 완료 설정 UI", () => {
    it("설정이 없으면 기본 OFF·15분을 표시하고 변경된 키만 저장한다", async () => {
        const settingsApi = api();
        render(<SettingsPanel api={settingsApi} />);
        expect(await screen.findByRole("checkbox", { name: "자동 완료 사용" })).toBeTruthy();
        expect((screen.getByRole("checkbox", { name: "자동 완료 사용" }) as HTMLInputElement).checked).toBe(false);
        expect((screen.getByRole("spinbutton", { name: "자동 완료 기준 (분)" }) as HTMLInputElement).value).toBe("15");

        fireEvent.click(screen.getByRole("checkbox", { name: "자동 완료 사용" }));
        fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
        await waitFor(() => expect(settingsApi.save).toHaveBeenCalledWith({ "auto_complete.enabled": "true" }));
        expect(await screen.findByText("저장됐습니다.")).toBeTruthy();
    });

    it("1~120분 범위를 벗어나면 즉시 알리고 저장하지 않는다", async () => {
        const settingsApi = api({ "auto_complete.enabled": "true", "auto_complete.minutes": "20" });
        render(<SettingsPanel api={settingsApi} />);
        const minutes = await screen.findByRole("spinbutton", { name: "자동 완료 기준 (분)" });
        fireEvent.change(minutes, { target: { value: "121" } });
        expect(screen.getByRole("alert").textContent).toContain("1~120분");
        expect((screen.getByRole("button", { name: "설정 저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(settingsApi.save).not.toHaveBeenCalled();
    });

    it("저장 실패 시 입력값을 유지하고 다시 시도할 수 있다", async () => {
        const settingsApi = api({ "auto_complete.enabled": "false", "auto_complete.minutes": "15" });
        vi.mocked(settingsApi.save).mockRejectedValueOnce(new Error("500"));
        render(<SettingsPanel api={settingsApi} />);
        const minutes = await screen.findByRole("spinbutton", { name: "자동 완료 기준 (분)" });
        fireEvent.change(minutes, { target: { value: "25" } });
        fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
        expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("저장하지 못했습니다"));
        expect((minutes as HTMLInputElement).value).toBe("25");
        fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
        await waitFor(() => expect(settingsApi.save).toHaveBeenLastCalledWith({ "auto_complete.minutes": "25" }));
    });
});
