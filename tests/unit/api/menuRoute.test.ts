import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

// Supabase 클라이언트만 가짜로 둔다 — 라우트 → 서비스 → 저장소 → 매퍼는 실제 코드가 돈다.
const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), rpc: vi.fn() }));
vi.mock("@/infra/supabase/server", () => ({
    createServiceClient: vi.fn(() => ({ from: db.from, rpc: db.rpc })),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/menu/route";

// supabase/seed.sql(T-36) 형식의 ID — RFC variant 비트가 없어도 통과해야 한다.
const MENU_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "12121212-1212-1212-1212-121212121212";
const OPTION_ID = "13131313-1313-1313-1313-131313131313";

const menuRow = {
    id: MENU_ID,
    base_price: 2000,
    stock: 3,
    is_sold_out_manual: false,
    is_active: true,
    sort_order: 1,
    image_url: null,
    menu_item_translations: [
        { locale: "ko", name: "기본호떡", description: "기본호떡" },
        { locale: "en", name: "Original Hotteok", description: "Original Korean sweet pancake" },
    ],
    option_groups: [{
        id: GROUP_ID,
        min_select: 0,
        max_select: 1,
        sort_order: 0,
        is_active: true,
        option_group_translations: [
            { locale: "ko", name: "토핑" },
            { locale: "en", name: "Topping" },
        ],
        options: [{
            id: OPTION_ID,
            extra_price: 500,
            sort_order: 0,
            is_active: true,
            option_translations: [{ locale: "ko", name: "치즈" }],
        }],
    }],
};

const INTERNAL_ERROR_ENVELOPE = {
    error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." },
};

async function get(query = "") {
    const response = await GET(new NextRequest(`http://localhost/api/menu${query}`));
    return { status: response.status, json: await response.json() };
}

beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue({ select: db.select });
    db.select.mockResolvedValue({ data: [menuRow], error: null });
    db.rpc.mockResolvedValue({ data: 3, error: null });
});

describe("GET /api/menu", () => {
    it.each(["", "?lang=ko"])("쿼리 %j → ko 메뉴판과 전체 대기 수를 200으로 준다", async (query) => {
        const { status, json } = await get(query);

        expect(status).toBe(200);
        expect(json).toEqual({
            items: [{
                id: MENU_ID,
                name: "기본호떡",
                description: "기본호떡",
                price: 2000,
                stock: 3,
                isAvailable: true,
                isSoldOut: false,
                imageUrl: null,
                optionGroups: [{
                    id: GROUP_ID,
                    name: "토핑",
                    minSelect: 0,
                    maxSelect: 1,
                    options: [{ id: OPTION_ID, name: "치즈", extraPrice: 500 }],
                }],
            }],
            waitingCount: 3,
            locale: "ko",
        });
        expect(db.from).toHaveBeenCalledWith("menu_items");
        expect(db.rpc).toHaveBeenCalledWith("count_waiting_before", { p_created_at: null });
    });

    it("lang=en이면 영어 이름을 주고, en 번역이 없는 옵션은 ko로 폴백한다", async () => {
        const { status, json } = await get("?lang=en");

        expect(status).toBe(200);
        expect(json.locale).toBe("en");
        expect(json.items[0]).toMatchObject({ name: "Original Hotteok", description: "Original Korean sweet pancake" });
        expect(json.items[0].optionGroups[0].name).toBe("Topping");
        expect(json.items[0].optionGroups[0].options[0].name).toBe("치즈");
    });

    it("lang 외 쿼리는 무시한다", async () => {
        const { status, json } = await get("?lang=en&_=1727740800000");

        expect(status).toBe(200);
        expect(json.locale).toBe("en");
    });

    it.each(["?lang=fr", "?lang=EN", "?lang=", "?lang=ko,en", "?lang=%20ko"])(
        "허용 외 lang(%s)은 400 VALIDATION_ERROR 봉투, DB는 호출하지 않는다",
        async (query) => {
            const { status, json } = await get(query);

            expect(status).toBe(400);
            expect(json.error).toMatchObject({ code: "VALIDATION_ERROR", message: "Request validation failed." });
            expect(json.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: ["lang"] })]));
            expect(db.from).not.toHaveBeenCalled();
            expect(db.rpc).not.toHaveBeenCalled();
        },
    );

    it("메뉴 조회 DB 오류는 500 INTERNAL_ERROR 봉투, DB 메시지·details를 노출하지 않는다", async () => {
        db.select.mockResolvedValue({ data: null, error: { message: 'relation "menu_items" does not exist', code: "42P01" } });

        const { status, json } = await get();

        expect(status).toBe(500);
        expect(json).toEqual(INTERNAL_ERROR_ENVELOPE);
    });

    it("대기 수 조회 DB 오류도 500 INTERNAL_ERROR 봉투, DB 메시지를 노출하지 않는다", async () => {
        db.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function count_waiting_before", code: "42501" } });

        const { status, json } = await get();

        expect(status).toBe(500);
        expect(json).toEqual(INTERNAL_ERROR_ENVELOPE);
    });
});
