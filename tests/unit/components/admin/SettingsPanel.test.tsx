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

describe("T-52 계좌 정보·미입금 만료 설정 UI", () => {
    it("계좌 정보가 없으면 미입력을 알리고 만료 기본값 10분을 표시한다", async () => {
        render(<SettingsPanel api={api()} />);
        expect((await screen.findByRole("spinbutton", { name: "미입금 만료 기준 (분)" }) as HTMLInputElement).value).toBe("10");
        expect(screen.getByText("계좌 정보가 미입력 상태입니다. 세 항목을 모두 입력해야 고객에게 계좌이체 안내가 표시됩니다.")).toBeTruthy();
        expect((screen.getByRole("button", { name: "설정 저장" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("계좌번호와 만료 시간만 바꾸면 해당 두 키만 저장한다", async () => {
        const settingsApi = api({
            "transfer.bank_name": "국민은행", "transfer.account_number": "111-222",
            "transfer.account_holder": "김혁", "payment.expire_minutes": "10",
            "auto_complete.enabled": "true", "auto_complete.minutes": "20",
        });
        render(<SettingsPanel api={settingsApi} />);
        fireEvent.change(await screen.findByRole("textbox", { name: "계좌번호" }), { target: { value: "333-444" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: "미입금 만료 기준 (분)" }), { target: { value: "12" } });
        fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
        await waitFor(() => expect(settingsApi.save).toHaveBeenCalledWith({
            "transfer.account_number": "333-444", "payment.expire_minutes": "12",
        }));
        expect(await screen.findByText("저장됐습니다.")).toBeTruthy();
    });

    it("만료 시간 범위를 벗어나면 저장하지 않고 입력 오류를 보여 준다", async () => {
        const settingsApi = api({ "payment.expire_minutes": "10" });
        render(<SettingsPanel api={settingsApi} />);
        const minutes = await screen.findByRole("spinbutton", { name: "미입금 만료 기준 (분)" });
        fireEvent.change(minutes, { target: { value: "0" } });
        expect(screen.getByText("미입금 만료 기준은 1~120분의 정수여야 합니다.")).toBeTruthy();
        expect((screen.getByRole("button", { name: "설정 저장" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(minutes, { target: { value: "121" } });
        expect((screen.getByRole("button", { name: "설정 저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(settingsApi.save).not.toHaveBeenCalled();
    });

    it("계좌 저장에 실패해도 입력을 유지하고 다시 저장할 수 있다", async () => {
        const settingsApi = api({ "transfer.bank_name": "국민은행" });
        vi.mocked(settingsApi.save).mockRejectedValueOnce(new Error("500"));
        render(<SettingsPanel api={settingsApi} />);
        const bank = await screen.findByRole("textbox", { name: "은행명" });
        fireEvent.change(bank, { target: { value: "신한은행" } });
        fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
        expect(await screen.findByText(/설정을 저장하지 못했습니다/)).toBeTruthy();
        expect((bank as HTMLInputElement).value).toBe("신한은행");
        fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
        await waitFor(() => expect(settingsApi.save).toHaveBeenLastCalledWith({ "transfer.bank_name": "신한은행" }));
    });
});
