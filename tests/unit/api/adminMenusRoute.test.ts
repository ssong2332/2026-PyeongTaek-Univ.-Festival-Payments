import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn().mockReturnValue({}) }));
vi.mock("@/infra/repositories/adminMenuRepository", () => ({ createSupabaseAdminMenuRepository: vi.fn().mockReturnValue({}) }));
vi.mock("@/services/adminMenuService");

import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { GET, POST } from "@/app/api/admin/menus/route";
import { PATCH as patchMenu } from "@/app/api/admin/menus/[id]/route";
import { PATCH as patchOptionGroup } from "@/app/api/admin/option-groups/[id]/route";
import { PATCH as patchOption } from "@/app/api/admin/options/[id]/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createAdminMenu, listAdminMenus, updateAdminMenu, updateAdminOption, updateAdminOptionGroup } from "@/services/adminMenuService";
import { AppError } from "@/lib/api/errors";
import type { AdminMenuDto } from "@/lib/dto/adminMenu";

// 수정 규칙은 서비스 테스트가 확인한다. 여기서는 인증 순서·요청 검사(스키마)·값 전달·HTTP 응답 모양만 본다.
const MENU_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const OPTION_ID = "33333333-3333-4333-8333-333333333333";

const menu: AdminMenuDto = {
    id: MENU_ID,
    translations: { ko: { name: "기본 호떡", description: null }, en: { name: "Original Hotteok", description: null } },
    basePrice: 2000,
    stock: 10,
    isRecommended: false,
    isSoldOutManual: false,
    isActive: true,
    sortOrder: 0,
    imageUrl: null,
    optionGroups: [],
};

type Patch = (request?: NextRequest, context?: { params: Promise<{ id: string }> }) => Promise<Response>;

async function send(handler: Patch, path: string, id: string, body: unknown) {
    const request = new NextRequest(`http://localhost:3000${path}/${id}`, {
        method: "PATCH",
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const response = await handler(request, { params: Promise.resolve({ id }) });
    return { status: response.status, json: await response.json(), cache: response.headers.get("Cache-Control") };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "admin@test.com" } as unknown as User);
    vi.mocked(listAdminMenus).mockResolvedValue({ menus: [menu] });
    vi.mocked(createAdminMenu).mockResolvedValue(menu);
    vi.mocked(updateAdminMenu).mockResolvedValue(menu);
    vi.mocked(updateAdminOptionGroup).mockResolvedValue(menu);
    vi.mocked(updateAdminOption).mockResolvedValue(menu);
});


describe("POST /api/admin/menus — T-37", () => {
    const input = {
        translations: {
            ko: { name: "시나몬 호떡", description: "달콤" },
            en: { name: "Cinnamon Hotteok", description: "Sweet" },
        },
        basePrice: 3000,
        stock: 20,
        optionGroups: [{
            translations: { ko: { name: "토핑" }, en: { name: "Topping" } },
            minSelect: 0,
            maxSelect: 1,
            options: [{
                translations: { ko: { name: "치즈" }, en: { name: "Cheese" } },
                extraPrice: 500,
            }],
        }],
    };

    it("인증된 관리자가 메뉴와 옵션 구조를 등록하면 201", async () => {
        const request = new NextRequest("http://localhost:3000/api/admin/menus", {
            method: "POST", body: JSON.stringify(input),
        });
        const response = await POST(request);
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual(menu);
        expect(createAdminMenu).toHaveBeenCalledWith(input, expect.anything());
    });

    it("영어 이름 누락이나 잘못된 선택 범위는 400", async () => {
        const request = new NextRequest("http://localhost:3000/api/admin/menus", {
            method: "POST",
            body: JSON.stringify({ ...input, translations: { ko: { name: "새 메뉴" } } }),
        });
        expect((await POST(request)).status).toBe(400);
        expect(createAdminMenu).not.toHaveBeenCalled();
    });
});

describe("GET /api/admin/menus", () => {
    it("관리자에게 200 { menus } (캐시 금지)", async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ menus: [menu] });
    });

    it("인증되지 않으면 401 UNAUTHORIZED, 저장소를 읽지 않는다", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const response = await GET();
        expect(response.status).toBe(401);
        expect((await response.json()).error.code).toBe("UNAUTHORIZED");
        expect(listAdminMenus).not.toHaveBeenCalled();
    });
});

describe("PATCH /api/admin/menus/[id]", () => {
    const patch = (body: unknown, id = MENU_ID) => send(patchMenu, "/api/admin/menus", id, body);

    it("판매 종료/재판매 값을 관리자 메뉴 서비스에 전달한다", async () => {
        const result = await patch({ isActive: false });
        expect(result.status).toBe(200);
        expect(updateAdminMenu).toHaveBeenCalledWith(MENU_ID, { isActive: false }, expect.anything());
    });

    it("추천 ON/OFF 값을 관리자 메뉴 서비스에 전달한다", async () => {
        const result = await patch({ isRecommended: true });
        expect(result.status).toBe(200);
        expect(updateAdminMenu).toHaveBeenCalledWith(MENU_ID, { isRecommended: true }, expect.anything());
    });

    it("검사를 통과한 값(이름은 앞뒤 공백 제거)을 서비스에 넘기고 200 AdminMenuDto", async () => {
        const result = await patch({ basePrice: 2500, stock: 0, isSoldOutManual: true, translations: { ko: { name: "  꿀 호떡 " } } });
        expect(result).toEqual({ status: 200, json: menu, cache: "private, no-store" });
        expect(vi.mocked(updateAdminMenu).mock.calls[0][0]).toBe(MENU_ID);
        expect(vi.mocked(updateAdminMenu).mock.calls[0][1]).toEqual({
            basePrice: 2500, stock: 0, isSoldOutManual: true, translations: { ko: { name: "꿀 호떡" } },
        });
    });

    it.each([
        ["ko 이름 빈값", { translations: { ko: { name: "" } } }],
        ["ko 이름 공백만", { translations: { ko: { name: "   " } } }],
        ["음수 가격", { basePrice: -1 }],
        ["음수 재고", { stock: -5 }],
        ["소수 재고", { stock: 1.5 }],
        ["문자 가격", { basePrice: "2000" }],
        ["모르는 언어", { translations: { ja: { name: "ホットク" } } }],
        ["빈 번역", { translations: {} }],
        ["빈 본문", {}],
        ["JSON 아님", "not-json"],
    ])("%s → 400 VALIDATION_ERROR, 서비스 미호출", async (_, body) => {
        const { status, json } = await patch(body);
        expect(status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(updateAdminMenu).not.toHaveBeenCalled();
    });

    it("id가 uuid 형식이 아니면 400 VALIDATION_ERROR", async () => {
        const { status, json } = await patch({ stock: 1 }, "abc");
        expect(status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(updateAdminMenu).not.toHaveBeenCalled();
    });

    it("인증되지 않으면 id·본문 검사보다 먼저 401", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const { status, json } = await patch("not-json", "abc");
        expect(status).toBe(401);
        expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("서비스의 404 NOT_FOUND를 그대로 응답", async () => {
        vi.mocked(updateAdminMenu).mockRejectedValueOnce(new AppError("NOT_FOUND", 404));
        const { status, json } = await patch({ stock: 1 });
        expect(status).toBe(404);
        expect(json.error.code).toBe("NOT_FOUND");
    });
});

describe("PATCH /api/admin/option-groups/[id]", () => {
    const patch = (body: unknown, id = GROUP_ID) => send(patchOptionGroup, "/api/admin/option-groups", id, body);

    it("값을 서비스에 넘기고 200 AdminMenuDto(소속 메뉴)", async () => {
        const result = await patch({ minSelect: 1, maxSelect: 2, isActive: true, translations: { en: { name: "Sauce" } } });
        expect(result.status).toBe(200);
        expect(result.json).toEqual(menu);
        expect(vi.mocked(updateAdminOptionGroup).mock.calls[0].slice(0, 2)).toEqual([
            GROUP_ID, { minSelect: 1, maxSelect: 2, isActive: true, translations: { en: { name: "Sauce" } } },
        ]);
    });

    it.each([
        ["최대 < 최소", { minSelect: 3, maxSelect: 1 }],
        ["최대 0", { maxSelect: 0 }],
        ["음수 최소", { minSelect: -1 }],
        ["모르는 필드", { sortOrder: 1 }],
        ["빈 본문", {}],
    ])("%s → 400 VALIDATION_ERROR", async (_, body) => {
        const { status, json } = await patch(body);
        expect(status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(updateAdminOptionGroup).not.toHaveBeenCalled();
    });
});

describe("PATCH /api/admin/options/[id]", () => {
    const patch = (body: unknown, id = OPTION_ID) => send(patchOption, "/api/admin/options", id, body);

    it("값을 서비스에 넘기고 200 AdminMenuDto(소속 메뉴)", async () => {
        const result = await patch({ extraPrice: 700, isActive: false, translations: { ko: { name: "견과" } } });
        expect(result.status).toBe(200);
        expect(vi.mocked(updateAdminOption).mock.calls[0].slice(0, 2)).toEqual([
            OPTION_ID, { extraPrice: 700, isActive: false, translations: { ko: { name: "견과" } } },
        ]);
    });

    it.each([
        ["음수 추가 가격", { extraPrice: -100 }],
        ["빈 이름", { translations: { ko: { name: " " } } }],
        ["모르는 필드", { name: "치즈" }],
        ["빈 본문", {}],
    ])("%s → 400 VALIDATION_ERROR", async (_, body) => {
        const { status, json } = await patch(body);
        expect(status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(updateAdminOption).not.toHaveBeenCalled();
    });

    it("인증되지 않으면 401", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const { status } = await patch({ extraPrice: 1 });
        expect(status).toBe(401);
    });
});
