// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const replace = vi.fn();
const router = { replace, push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { MenuManagementPanel, type MenuAdminApi } from "@/components/admin/MenuManagementPanel";
import { MenuAdminRequestError } from "@/features/admin/useMenuAdmin";
import type { AdminMenuDto } from "@/lib/dto/adminMenu";

// T-20 메뉴·재고 관리 화면(F-25·F-26·F-27). 서버 쪽 규칙은 adminMenuService·라우트 테스트가 확인하고,
// 여기서는 화면이 Architecture 7절 계약대로 요청을 보내고 응답·실패를 보여 주는지만 가짜 api로 확인한다.
const MENU_ID = "11111111-1111-4111-8111-111111111111";
const MENU_ID_2 = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const OPTION_ID = "44444444-4444-4444-8444-444444444444";

function menu(overrides: Partial<AdminMenuDto> = {}): AdminMenuDto {
    return {
        id: MENU_ID,
        translations: { ko: { name: "기본 호떡", description: "꿀 호떡" }, en: { name: "Original Hotteok", description: null } },
        basePrice: 2000,
        stock: 10,
        isRecommended: false,
        isSoldOutManual: false,
        isActive: true,
        sortOrder: 0,
        imageUrl: null,
        optionGroups: [{
            id: GROUP_ID,
            translations: { ko: { name: "토핑" }, en: { name: "Topping" } },
            minSelect: 0,
            maxSelect: 2,
            isActive: true,
            options: [{ id: OPTION_ID, translations: { ko: { name: "치즈" }, en: { name: "Cheese" } }, extraPrice: 500, isActive: true }],
        }],
        ...overrides,
    };
}

function fakeApi(menus: AdminMenuDto[] = [menu()]): MenuAdminApi {
    let current = structuredClone(menus);
    const apply = (id: string, change: (item: AdminMenuDto) => void) => {
        const item = current.find((candidate) => candidate.id === id) ?? current[0];
        change(item);
        current = current.map((candidate) => (candidate.id === item.id ? item : candidate));
        return structuredClone(item);
    };
    return {
        load: vi.fn(async () => structuredClone(current)),
        createMenu: vi.fn(async (input) => {
            const created: AdminMenuDto = {
                id: "77777777-7777-4777-8777-777777777777",
                translations: {
                    ko: { name: input.translations.ko.name, description: input.translations.ko.description || null },
                    en: { name: input.translations.en.name, description: input.translations.en.description || null },
                },
                basePrice: input.basePrice, stock: input.stock, isRecommended: false, isSoldOutManual: false,
                isActive: true, sortOrder: current.length, imageUrl: null,
                optionGroups: input.optionGroups.map((group, groupIndex) => ({
                    id: `88888888-8888-4888-8888-${String(groupIndex + 1).padStart(12, "0")}`,
                    translations: { ko: { name: group.translations.ko.name }, en: { name: group.translations.en.name } },
                    minSelect: group.minSelect, maxSelect: group.maxSelect, isActive: true,
                    options: group.options.map((option, optionIndex) => ({
                        id: `99999999-9999-4999-8999-${String(optionIndex + 1).padStart(12, "0")}`,
                        translations: { ko: { name: option.translations.ko.name }, en: { name: option.translations.en.name } },
                        extraPrice: option.extraPrice, isActive: true,
                    })),
                })),
            };
            current = [...current, created];
            return structuredClone(created);
        }),
        updateMenu: vi.fn(async (id, patch) => apply(id, (item) => {
            if (patch.basePrice !== undefined) item.basePrice = patch.basePrice;
            if (patch.stock !== undefined) item.stock = patch.stock;
            if (patch.isRecommended !== undefined) item.isRecommended = patch.isRecommended;
            if (patch.isSoldOutManual !== undefined) item.isSoldOutManual = patch.isSoldOutManual;
            if (patch.isActive !== undefined) item.isActive = patch.isActive;
            if (patch.translations?.ko) item.translations.ko = { name: patch.translations.ko.name, description: patch.translations.ko.description || null };
        })),
        updateOptionGroup: vi.fn(async () => structuredClone(current[0])),
        updateOption: vi.fn(async (_id, patch) => apply(MENU_ID, (item) => {
            const option = item.optionGroups[0].options[0];
            if (patch.isActive !== undefined) option.isActive = patch.isActive;
            if (patch.extraPrice !== undefined) option.extraPrice = patch.extraPrice;
        })),
    };
}

const card = (name: string) => screen.getByRole("article", { name });

beforeEach(() => replace.mockClear());
afterEach(cleanup);

describe("T-20 메뉴·재고 관리 화면", () => {
    it("메뉴마다 판매 상태(판매중·재고 0 품절·수동 품절·판매 종료)와 지금 품절 수를 보여 준다", async () => {
        render(<MenuManagementPanel api={fakeApi([
            menu(),
            menu({ id: MENU_ID_2, translations: { ko: { name: "치즈 호떡", description: null } }, stock: 0, optionGroups: [] }),
            menu({ id: "55555555-5555-4555-8555-555555555555", translations: { ko: { name: "꿀버터 호떡", description: null } }, isSoldOutManual: true, optionGroups: [] }),
            menu({ id: "66666666-6666-4666-8666-666666666666", translations: { ko: { name: "판매 종료 호떡", description: null } }, isActive: false, optionGroups: [] }),
        ])} />);

        expect(within(await screen.findByRole("article", { name: "기본 호떡" })).getByText("판매중 · 재고 10")).toBeTruthy();
        expect(within(card("치즈 호떡")).getByText("품절(재고 0)")).toBeTruthy();
        expect(within(card("꿀버터 호떡")).getByText("품절(수동)")).toBeTruthy();
        expect(within(card("판매 종료 호떡")).getByText("판매 종료(메뉴판 미노출)")).toBeTruthy();
        expect(screen.getByText(/지금 품절/).textContent).toContain("2");
        expect(screen.getByRole("button", { name: "메뉴 추가" })).toBeTruthy();
    });


    it("새 메뉴를 ko/en 이름·가격·재고·옵션과 함께 등록한다(T-37)", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        fireEvent.click(await screen.findByRole("button", { name: "메뉴 추가" }));
        const form = screen.getByRole("region", { name: "새 메뉴 등록" });
        fireEvent.change(within(form).getByLabelText("이름(한국어)"), { target: { value: "시나몬 호떡" } });
        fireEvent.change(within(form).getByLabelText("이름(영어)"), { target: { value: "Cinnamon Hotteok" } });
        fireEvent.change(within(form).getByLabelText("가격(원)"), { target: { value: "3000" } });
        fireEvent.change(within(form).getByLabelText("초기 재고"), { target: { value: "20" } });
        fireEvent.click(within(form).getByRole("button", { name: /옵션 그룹 추가/ }));
        fireEvent.change(within(form).getByLabelText("그룹명(한국어)"), { target: { value: "토핑" } });
        fireEvent.change(within(form).getByLabelText("그룹명(영어)"), { target: { value: "Topping" } });
        fireEvent.click(within(form).getByRole("button", { name: "옵션 추가" }));
        fireEvent.change(within(form).getByLabelText("옵션명(한국어)"), { target: { value: "치즈" } });
        fireEvent.change(within(form).getByLabelText("옵션명(영어)"), { target: { value: "Cheese" } });
        fireEvent.change(within(form).getByLabelText("추가 가격"), { target: { value: "500" } });
        fireEvent.click(within(form).getByRole("button", { name: "메뉴 등록" }));
        await waitFor(() => expect(api.createMenu).toHaveBeenCalled());
        expect(await screen.findByRole("article", { name: "시나몬 호떡" })).toBeTruthy();
    });

    it("판매 종료는 물리 삭제하지 않고 isActive=false로 저장하고 다시 판매할 수 있다(T-37)", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });
        fireEvent.click(within(target).getByRole("button", { name: "판매 종료" }));
        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { isActive: false }));
        expect(await within(target).findByText("판매 종료(메뉴판 미노출)")).toBeTruthy();
        fireEvent.click(within(target).getByRole("button", { name: "다시 판매" }));
        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { isActive: true }));
    });

    it("품절 처리 스위치는 누르는 즉시 isSoldOutManual만 저장하고 상태를 바꾼다(F-26)", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);

        fireEvent.click(await screen.findByRole("switch", { name: "기본 호떡 품절 처리" }));

        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { isSoldOutManual: true }));
        expect(await within(card("기본 호떡")).findByText("품절(수동)")).toBeTruthy();
        expect(within(card("기본 호떡")).getByRole("status").textContent).toBe("품절로 바꿨어요.");
    });

    it("추천 스위치를 저장하고 응답으로 ON/OFF 상태를 갱신한다", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const toggle = await screen.findByRole("switch", { name: "기본 호떡 추천 메뉴" });
        expect(toggle.getAttribute("aria-checked")).toBe("false");

        fireEvent.click(toggle);
        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { isRecommended: true }));
        await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));

        fireEvent.click(toggle);
        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { isRecommended: false }));
        await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    });

    it("가격·재고를 고친 뒤 [저장]하면 바뀐 칸만 보낸다(재고 +10 버튼 포함)", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });
        const save = within(target).getByRole("button", { name: "메뉴 저장" }) as HTMLButtonElement;
        expect(save.disabled).toBe(true);

        fireEvent.change(within(target).getByLabelText("가격(원)"), { target: { value: "2500" } });
        fireEvent.click(within(target).getByRole("button", { name: "기본 호떡 재고 10 늘리기" }));
        fireEvent.click(within(target).getByRole("button", { name: "기본 호떡 재고 1 줄이기" }));
        expect((within(target).getByLabelText("재고") as HTMLInputElement).value).toBe("19");
        fireEvent.click(save);

        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { basePrice: 2500, stock: 19 }));
        expect(await within(target).findByText("판매중 · 재고 19")).toBeTruthy();
    });

    it("가격을 고치던 중 품절 스위치를 눌러도 입력한 가격은 남는다", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.change(within(target).getByLabelText("가격(원)"), { target: { value: "2800" } });
        fireEvent.click(within(target).getByRole("switch", { name: "기본 호떡 품절 처리" }));

        expect(await within(target).findByText("품절(수동)")).toBeTruthy();
        expect((within(target).getByLabelText("가격(원)") as HTMLInputElement).value).toBe("2800");
        expect((within(target).getByRole("button", { name: "메뉴 저장" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("재고를 0으로 저장하면 따로 누르지 않아도 품절로 보인다(F-25)", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.change(within(target).getByLabelText("재고"), { target: { value: "0" } });
        fireEvent.click(within(target).getByRole("button", { name: "메뉴 저장" }));

        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { stock: 0 }));
        expect(await within(target).findByText("품절(재고 0)")).toBeTruthy();
    });

    it.each([
        ["한국어 이름 빈칸", "이름(한국어)", "", "한국어 이름을 입력해 주세요."],
        ["영어 이름을 지움", "이름(영어)", " ", "영어 이름을 입력해 주세요."],
        ["음수 가격", "가격(원)", "-100", "가격은 0 이상의 정수"],
        ["글자 재고", "재고", "열개", "재고는 0 이상의 정수"],
    ])("%s → 즉시 알리고 저장 버튼을 잠근다", async (_, label, value, message) => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.change(within(target).getByLabelText(label), { target: { value } });

        expect(within(target).getByRole("alert").textContent).toContain(message);
        expect((within(target).getByRole("button", { name: "메뉴 저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(api.updateMenu).not.toHaveBeenCalled();
    });

    it("이름·설명을 바꾸면 한국어 이름과 설명을 함께 보낸다(빈 설명은 지움)", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.change(within(target).getByLabelText("이름(한국어)"), { target: { value: " 꿀 호떡 " } });
        fireEvent.change(within(target).getByLabelText("설명(한국어)"), { target: { value: "" } });
        fireEvent.click(within(target).getByRole("button", { name: "메뉴 저장" }));

        await waitFor(() => expect(api.updateMenu).toHaveBeenCalledWith(MENU_ID, { translations: { ko: { name: "꿀 호떡", description: "" } } }));
    });

    it("저장에 실패하면 입력값을 그대로 두고 안내한다", async () => {
        const api = fakeApi();
        vi.mocked(api.updateMenu).mockRejectedValueOnce(new Error("network"));
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.change(within(target).getByLabelText("가격(원)"), { target: { value: "3000" } });
        fireEvent.click(within(target).getByRole("button", { name: "메뉴 저장" }));

        expect((await within(target).findByRole("alert")).textContent).toContain("저장하지 못했어요");
        expect((within(target).getByLabelText("가격(원)") as HTMLInputElement).value).toBe("3000");
    });

    it("옵션 판매 스위치는 즉시 저장하고, 추가 가격은 고친 뒤 저장한다", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.click(within(target).getByRole("switch", { name: "치즈 판매" }));
        await waitFor(() => expect(api.updateOption).toHaveBeenCalledWith(OPTION_ID, { isActive: false }));
        expect(await within(target).findByText("판매 중지")).toBeTruthy();

        fireEvent.change(within(target).getByLabelText("추가 가격"), { target: { value: "700" } });
        fireEvent.click(within(target).getByRole("button", { name: "치즈 옵션 저장" }));
        await waitFor(() => expect(api.updateOption).toHaveBeenCalledWith(OPTION_ID, { extraPrice: 700 }));
    });

    it("옵션 그룹 최대 선택이 최소보다 작으면 알리고 그룹 저장을 잠근다", async () => {
        const api = fakeApi();
        render(<MenuManagementPanel api={api} />);
        const target = await screen.findByRole("article", { name: "기본 호떡" });

        fireEvent.change(within(target).getByLabelText("최소 선택"), { target: { value: "3" } });

        expect(within(target).getByRole("alert").textContent).toContain("최대 선택 수는 최소 선택 수보다 작을 수 없어요.");
        expect((within(target).getByRole("button", { name: "그룹 저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(api.updateOptionGroup).not.toHaveBeenCalled();
    });

    it("메뉴가 0개면 시드 데이터 안내", async () => {
        render(<MenuManagementPanel api={fakeApi([])} />);
        expect(await screen.findByText("메뉴가 없습니다 — 시드 데이터를 확인하세요.")).toBeTruthy();
    });

    it("불러오기 실패 → 다시 시도로 다시 불러온다", async () => {
        const api = fakeApi();
        vi.mocked(api.load).mockRejectedValueOnce(new Error("network"));
        render(<MenuManagementPanel api={api} />);

        fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "다시 시도" }));

        expect(await screen.findByRole("article", { name: "기본 호떡" })).toBeTruthy();
        expect(api.load).toHaveBeenCalledTimes(2);
    });

    it("메뉴 API가 없는 배포(404)면 오류 대신 연결 안내", async () => {
        const api = fakeApi();
        vi.mocked(api.load).mockRejectedValueOnce(new MenuAdminRequestError(404));
        render(<MenuManagementPanel api={api} />);
        expect(await screen.findByText(/연결하지 못했어요/)).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
        const api = fakeApi();
        vi.mocked(api.load).mockRejectedValueOnce(new MenuAdminRequestError(401));
        render(<MenuManagementPanel api={api} />);
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/login"));
    });
});
