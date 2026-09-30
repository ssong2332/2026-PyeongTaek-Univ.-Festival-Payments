// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AdminLoginPage from "@/app/admin/login/page";
import AdminProtectedLayout from "@/app/admin/(protected)/layout";
import { LogoutButton } from "@/components/admin/LogoutButton";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
        refresh: mockRefresh,
    }),
    redirect: (url: string) => mockRedirect(url),
}));

// Mock Supabase browser client
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/infra/supabase/browser", () => ({
    createAdminBrowserClient: () => ({
        auth: {
            signInWithPassword: mockSignInWithPassword,
            signOut: mockSignOut,
        },
    }),
}));

// Mock Supabase session client for layout
const mockGetUser = vi.fn();
vi.mock("@/infra/supabase/session", () => ({
    createSessionClient: async () => ({
        auth: {
            getUser: mockGetUser,
        },
    }),
}));

describe("AdminLoginPage", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it("이메일과 비밀번호를 입력하지 않으면 로그인 버튼이 비활성화된다", () => {
        render(<AdminLoginPage />);
        const submitBtn = screen.getByRole("button", { name: "로그인" }) as HTMLButtonElement;
        expect(submitBtn.disabled).toBe(true);

        // 회원가입 링크가 없는지 확인 (F-20)
        expect(screen.queryByText(/회원가입/i)).toBeNull();
    });

    it("이메일과 비밀번호를 입력하면 버튼이 활성화된다", () => {
        render(<AdminLoginPage />);
        const emailInput = screen.getByLabelText("이메일");
        const passwordInput = screen.getByLabelText("비밀번호");
        const submitBtn = screen.getByRole("button", { name: "로그인" }) as HTMLButtonElement;

        fireEvent.change(emailInput, { target: { value: "admin@ptu.ac.kr" } });
        fireEvent.change(passwordInput, { target: { value: "password123" } });

        expect(submitBtn.disabled).toBe(false);
    });

    it("잘못된 비밀번호 입력 시 에러 메시지가 표시된다 (F-20)", async () => {
        mockSignInWithPassword.mockResolvedValueOnce({
            data: {},
            error: { message: "Invalid login credentials" },
        });

        render(<AdminLoginPage />);
        fireEvent.change(screen.getByLabelText("이메일"), {
            target: { value: "admin@ptu.ac.kr" },
        });
        fireEvent.change(screen.getByLabelText("비밀번호"), {
            target: { value: "wrongpassword" },
        });
        fireEvent.click(screen.getByRole("button", { name: "로그인" }));

        await waitFor(() => {
            expect(
                screen.getByText("이메일 또는 비밀번호가 올바르지 않습니다."),
            ).toBeTruthy();
        });
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("로그인 성공 시 /admin으로 이동한다", async () => {
        mockSignInWithPassword.mockResolvedValueOnce({
            data: { user: { id: "admin-1" } },
            error: null,
        });

        render(<AdminLoginPage />);
        fireEvent.change(screen.getByLabelText("이메일"), {
            target: { value: "admin@ptu.ac.kr" },
        });
        fireEvent.change(screen.getByLabelText("비밀번호"), {
            target: { value: "validpassword" },
        });
        fireEvent.click(screen.getByRole("button", { name: "로그인" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/admin");
            expect(mockRefresh).toHaveBeenCalled();
        });
    });
});

describe("AdminProtectedLayout", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it("세션이 없으면 /admin/login으로 리다이렉트한다", async () => {
        mockGetUser.mockResolvedValueOnce({
            data: { user: null },
            error: { message: "Unauthorized" },
        });

        await AdminProtectedLayout({
            children: <div>Protected Content</div>,
        });

        expect(mockRedirect).toHaveBeenCalledWith("/admin/login");
    });

    it("세션이 있으면 레이아웃과 자식 컴포넌트를 정상 렌더링한다", async () => {
        mockGetUser.mockResolvedValueOnce({
            data: { user: { id: "admin-1", email: "admin@ptu.ac.kr" } },
            error: null,
        });

        const jsx = await AdminProtectedLayout({
            children: <div data-testid="child">Protected Content</div>,
        });

        render(jsx!);
        expect(screen.getByText("평택대 부스 관리자")).toBeTruthy();
        expect(screen.getByText("admin@ptu.ac.kr")).toBeTruthy();
        expect(screen.getByTestId("child")).toBeTruthy();
    });
});

describe("LogoutButton", () => {
    const LOGOUT_ERROR = "로그아웃에 실패했습니다. 다시 시도해 주세요.";

    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    function logoutButton() {
        return screen.getByRole("button", { name: "로그아웃" }) as HTMLButtonElement;
    }

    it("로그아웃 성공 시 /admin/login으로 이동한다", async () => {
        mockSignOut.mockResolvedValueOnce({ error: null });

        render(<LogoutButton />);
        fireEvent.click(logoutButton());

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/admin/login");
            expect(mockRefresh).toHaveBeenCalled();
        });
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("signOut()이 error를 반환하면 이동하지 않고 오류를 표시하며 버튼을 다시 활성화한다", async () => {
        mockSignOut.mockResolvedValueOnce({ error: { message: "Failed to fetch" } });

        render(<LogoutButton />);
        fireEvent.click(logoutButton());

        expect((await screen.findByRole("alert")).textContent).toBe(LOGOUT_ERROR);
        expect(logoutButton().disabled).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("signOut()이 예외를 던져도 이동하지 않고 같은 오류를 표시한다", async () => {
        mockSignOut.mockRejectedValueOnce(new Error("network down"));

        render(<LogoutButton />);
        fireEvent.click(logoutButton());

        expect((await screen.findByRole("alert")).textContent).toBe(LOGOUT_ERROR);
        expect(logoutButton().disabled).toBe(false);
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("로그아웃 진행 중에는 버튼이 잠기고, 다시 눌러도 signOut()을 한 번만 호출한다", async () => {
        mockSignOut.mockReturnValueOnce(new Promise(() => {}));

        render(<LogoutButton />);
        fireEvent.click(logoutButton());

        const pending = (await screen.findByRole("button", { name: "로그아웃 중..." })) as HTMLButtonElement;
        expect(pending.disabled).toBe(true);
        fireEvent.click(pending);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("실패 후 다시 누르면 재시도하고, 성공하면 오류를 지우고 이동한다", async () => {
        mockSignOut
            .mockResolvedValueOnce({ error: { message: "Failed to fetch" } })
            .mockResolvedValueOnce({ error: null });

        render(<LogoutButton />);
        fireEvent.click(logoutButton());
        await screen.findByRole("alert");

        fireEvent.click(logoutButton());

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/admin/login");
        });
        expect(mockSignOut).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole("alert")).toBeNull();
    });
});
