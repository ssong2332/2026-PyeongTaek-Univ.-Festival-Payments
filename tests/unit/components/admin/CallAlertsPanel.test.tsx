// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CallAlertsPanel, type StaffCallAlert } from "@/components/admin/CallAlertsPanel";
import { DashboardPreview } from "@/features/admin/DashboardPreview";

afterEach(cleanup);

const alerts: StaffCallAlert[] = [
    { id: "call-1", pickupNumber: 7, createdAt: "2026-09-30T05:00:00.000Z", acknowledgedAt: null },
    { id: "call-2", pickupNumber: 8, createdAt: "2026-09-30T05:01:00.000Z", acknowledgedAt: "2026-09-30T05:02:00.000Z" },
];

it("shows only unresolved calls and removes one after server confirmation", async () => {
    const acknowledge = vi.fn(async () => {});
    render(<CallAlertsPanel alerts={alerts} onAcknowledge={acknowledge} />);
    expect(screen.getByText("픽업 #007")).toBeTruthy();
    expect(screen.queryByText("픽업 #008")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "픽업 007 직원 호출 확인" }));
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith("call-1"));
    await waitFor(() => expect(screen.getByText("확인할 직원 호출이 없습니다.")).toBeTruthy());
});

it("keeps the call and permits retry after a failed request", async () => {
    const acknowledge = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
    render(<CallAlertsPanel alerts={alerts} onAcknowledge={acknowledge} />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 007 직원 호출 확인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("다시 시도"));
    expect(screen.getByText("픽업 #007")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "픽업 007 직원 호출 확인" }));
    await waitFor(() => expect(screen.getByText("확인할 직원 호출이 없습니다.")).toBeTruthy());
    expect(acknowledge).toHaveBeenCalledTimes(2);
});

it("blocks another acknowledgement while one request is pending", async () => {
    let resolve!: () => void;
    const acknowledge = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const pending = { id: "call-3", pickupNumber: 9, createdAt: "2026-09-30T05:03:00.000Z", acknowledgedAt: null };
    render(<CallAlertsPanel alerts={[alerts[0], pending]} onAcknowledge={acknowledge} />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 007 직원 호출 확인" }));
    expect((screen.getByRole("button", { name: "픽업 009 직원 호출 확인" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "픽업 009 직원 호출 확인" }));
    expect(acknowledge).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(screen.queryByText("픽업 #007")).toBeNull());
});

it("shows a call in the dashboard preview and clears it with confirmation", async () => {
    render(<DashboardPreview />);
    expect(screen.getByText("픽업 #002")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "픽업 002 직원 호출 확인" }));
    await waitFor(() => expect(screen.getByText("확인할 직원 호출이 없습니다.")).toBeTruthy());
});
