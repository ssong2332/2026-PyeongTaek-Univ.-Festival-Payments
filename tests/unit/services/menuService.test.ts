import { describe, expect, it, vi } from "vitest";
import { getMenu } from "@/services/menuService";
import { MenuResponseSchema } from "@/lib/dto/menu";
import type { MenuItemRecord, MenuOptionGroupRecord, MenuOptionRecord } from "@/services/ports";
import { createFakeMenuRepository } from "../fakes/fakeMenuRepository";

const MENU_ID = "10000000-0000-4000-8000-000000000001";
const MENU_ID_2 = "10000000-0000-4000-8000-000000000002";
const MENU_ID_3 = "10000000-0000-4000-8000-000000000003";
const GROUP_ID = "20000000-0000-4000-8000-000000000001";
const GROUP_ID_2 = "20000000-0000-4000-8000-000000000002";
const OPTION_ID = "30000000-0000-4000-8000-000000000001";
const OPTION_ID_2 = "30000000-0000-4000-8000-000000000002";

function option(overrides: Partial<MenuOptionRecord> = {}): MenuOptionRecord {
    return {
        id: OPTION_ID,
        extraPrice: 500,
        sortOrder: 0,
        isActive: true,
        translations: [
            { locale: "ko", name: "치즈 추가" },
            { locale: "en", name: "Extra cheese" },
        ],
        ...overrides,
    };
}

function group(overrides: Partial<MenuOptionGroupRecord> = {}): MenuOptionGroupRecord {
    return {
        id: GROUP_ID,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 0,
        isActive: true,
        translations: [
            { locale: "ko", name: "토핑" },
            { locale: "en", name: "Topping" },
        ],
        options: [option()],
        ...overrides,
    };
}

function menu(overrides: Partial<MenuItemRecord> = {}): MenuItemRecord {
    return {
        id: MENU_ID,
        basePrice: 2000,
        stock: 10,
        isSoldOutManual: false,
        isActive: true,
        sortOrder: 0,
        imageUrl: null,
        translations: [
            { locale: "ko", name: "기본호떡", description: "꿀이 든 호떡" },
            { locale: "en", name: "Original Hotteok", description: "Sweet pancake with honey" },
        ],
        optionGroups: [],
        ...overrides,
    };
}

function waitingRepository(count = 0) {
    return { countWaitingBefore: vi.fn().mockResolvedValue(count) };
}

function menuFor(items: MenuItemRecord[], locale: "ko" | "en" = "ko", orderRepository = waitingRepository()) {
    return getMenu(locale, { menuRepository: createFakeMenuRepository(items), orderRepository });
}

describe("menuService.getMenu — GET /api/menu", () => {
    it("활성 메뉴를 MenuItemDto로 옮기고 waitingCount·locale을 함께 준다", async () => {
        const result = await menuFor(
            [menu({ imageUrl: "https://example.com/hotteok.png", optionGroups: [group({ minSelect: 1, maxSelect: 2 })] })],
            "ko",
            waitingRepository(4),
        );

        expect(result).toEqual({
            items: [{
                id: MENU_ID,
                name: "기본호떡",
                description: "꿀이 든 호떡",
                price: 2000,
                stock: 10,
                isAvailable: true,
                isSoldOut: false,
                imageUrl: "https://example.com/hotteok.png",
                optionGroups: [{
                    id: GROUP_ID,
                    name: "토핑",
                    minSelect: 1,
                    maxSelect: 2,
                    options: [{ id: OPTION_ID, name: "치즈 추가", extraPrice: 500 }],
                }],
            }],
            waitingCount: 4,
            locale: "ko",
        });
        // 프론트와 공유하는 응답 계약(zod)과 모양이 같다.
        expect(MenuResponseSchema.safeParse(result).success).toBe(true);
    });

    describe("메뉴 목록 범위", () => {
        it("비활성 메뉴는 뺀다", async () => {
            const result = await menuFor([menu({ id: MENU_ID }), menu({ id: MENU_ID_2, isActive: false })]);

            expect(result.items.map((item) => item.id)).toEqual([MENU_ID]);
        });

        it("메뉴가 0개면 items는 빈 배열이고 waitingCount·locale은 그대로 준다", async () => {
            const result = await menuFor([], "en", waitingRepository(2));

            expect(result).toEqual({ items: [], waitingCount: 2, locale: "en" });
        });

        it("메뉴가 모두 비활성이면 items는 빈 배열", async () => {
            const result = await menuFor([menu({ isActive: false })]);

            expect(result.items).toEqual([]);
        });
    });

    describe("품절 파생 — isSoldOut = is_sold_out_manual OR stock=0, isAvailable = !isSoldOut", () => {
        it.each([
            { label: "수동 품절(재고 5)", isSoldOutManual: true, stock: 5, isSoldOut: true },
            { label: "재고 0", isSoldOutManual: false, stock: 0, isSoldOut: true },
            { label: "수동 품절 + 재고 0", isSoldOutManual: true, stock: 0, isSoldOut: true },
            { label: "재고 1(경계)", isSoldOutManual: false, stock: 1, isSoldOut: false },
            { label: "재고 -1(음수 — stock <= 0 고정)", isSoldOutManual: false, stock: -1, isSoldOut: true },
        ])("$label → isSoldOut $isSoldOut", async ({ isSoldOutManual, stock, isSoldOut }) => {
            const [item] = (await menuFor([menu({ isSoldOutManual, stock })])).items;

            expect(item).toMatchObject({ stock, isSoldOut, isAvailable: !isSoldOut });
        });

        it("품절 메뉴도 목록에서 빼지 않는다", async () => {
            const result = await menuFor([menu({ id: MENU_ID, stock: 0 }), menu({ id: MENU_ID_2, isSoldOutManual: true })]);

            expect(result.items.map((item) => item.id)).toEqual([MENU_ID, MENU_ID_2]);
        });
    });

    describe("언어 — 요청 언어 → ko 폴백 (ADR-0005, F-05)", () => {
        it("en 요청이면 메뉴 이름·설명·그룹·옵션 이름을 영어로 준다", async () => {
            const result = await menuFor([menu({ optionGroups: [group()] })], "en");

            expect(result.locale).toBe("en");
            expect(result.items).toEqual([{
                id: MENU_ID,
                name: "Original Hotteok",
                description: "Sweet pancake with honey",
                price: 2000,
                stock: 10,
                isAvailable: true,
                isSoldOut: false,
                imageUrl: null,
                optionGroups: [{
                    id: GROUP_ID,
                    name: "Topping",
                    minSelect: 0,
                    maxSelect: 1,
                    options: [{ id: OPTION_ID, name: "Extra cheese", extraPrice: 500 }],
                }],
            }]);
        });

        it("en 번역 행이 없으면 메뉴·설명·그룹·옵션 모두 ko로 폴백한다", async () => {
            const koOnly = menu({
                translations: [{ locale: "ko", name: "기본호떡", description: "꿀이 든 호떡" }],
                optionGroups: [group({
                    translations: [{ locale: "ko", name: "토핑" }],
                    options: [option({ translations: [{ locale: "ko", name: "치즈 추가" }] })],
                })],
            });

            const [item] = (await menuFor([koOnly], "en")).items;

            expect(item.name).toBe("기본호떡");
            expect(item.description).toBe("꿀이 든 호떡");
            expect(item.optionGroups[0].name).toBe("토핑");
            expect(item.optionGroups[0].options[0].name).toBe("치즈 추가");
        });

        it.each(["", "   "])("en 이름·설명이 %j이면 ko로 폴백한다(빈 문자열 노출 0건)", async (blank) => {
            const blankEn = menu({
                translations: [
                    { locale: "ko", name: "기본호떡", description: "꿀이 든 호떡" },
                    { locale: "en", name: blank, description: blank },
                ],
                optionGroups: [group({
                    translations: [{ locale: "ko", name: "토핑" }, { locale: "en", name: blank }],
                    options: [option({ translations: [{ locale: "ko", name: "치즈 추가" }, { locale: "en", name: blank }] })],
                })],
            });

            const [item] = (await menuFor([blankEn], "en")).items;

            expect(item.name).toBe("기본호떡");
            expect(item.description).toBe("꿀이 든 호떡");
            expect(item.optionGroups[0].name).toBe("토핑");
            expect(item.optionGroups[0].options[0].name).toBe("치즈 추가");
        });

        it.each([
            { label: "en 설명 null → ko 설명", ko: "꿀이 든 호떡", en: null, expected: "꿀이 든 호떡" },
            { label: "둘 다 null → null", ko: null, en: null, expected: null },
            { label: "둘 다 공백 → null", ko: " ", en: "", expected: null },
        ])("설명: $label", async ({ ko, en, expected }) => {
            const item = menu({
                translations: [
                    { locale: "ko", name: "기본호떡", description: ko },
                    { locale: "en", name: "Original Hotteok", description: en },
                ],
            });

            const [dto] = (await menuFor([item], "en")).items;

            expect(dto.description).toBe(expected);
        });

        it("ko 이름이 없는 메뉴는 en 이름이 있어도 뺀다(create_order가 MENU_UNAVAILABLE로 거부하는 메뉴)", async () => {
            const enOnly = menu({ id: MENU_ID_2, translations: [{ locale: "en", name: "Mystery Hotteok", description: null }] });

            const result = await menuFor([menu({ id: MENU_ID }), enOnly], "en");

            expect(result.items.map((item) => item.id)).toEqual([MENU_ID]);
        });

        it("ko 이름이 없거나 공백인 옵션 그룹·옵션은 뺀다(create_order가 INVALID_OPTION으로 거부하는 옵션)", async () => {
            const item = menu({
                optionGroups: [
                    group({
                        id: GROUP_ID,
                        options: [
                            option({ id: OPTION_ID }),
                            option({ id: OPTION_ID_2, translations: [{ locale: "ko", name: " " }, { locale: "en", name: "Honey" }] }),
                        ],
                    }),
                    group({ id: GROUP_ID_2, translations: [{ locale: "en", name: "Sauce" }] }),
                ],
            });

            const [dto] = (await menuFor([item], "en")).items;

            expect(dto.optionGroups.map((g) => g.id)).toEqual([GROUP_ID]);
            expect(dto.optionGroups[0].options.map((o) => o.id)).toEqual([OPTION_ID]);
        });
    });

    describe("옵션 그룹·옵션", () => {
        it("비활성 옵션 그룹과 비활성 옵션은 뺀다", async () => {
            const item = menu({
                optionGroups: [
                    group({ id: GROUP_ID, options: [option({ id: OPTION_ID }), option({ id: OPTION_ID_2, isActive: false })] }),
                    group({ id: GROUP_ID_2, isActive: false }),
                ],
            });

            const [dto] = (await menuFor([item])).items;

            expect(dto.optionGroups).toEqual([{
                id: GROUP_ID,
                name: "토핑",
                minSelect: 0,
                maxSelect: 1,
                options: [{ id: OPTION_ID, name: "치즈 추가", extraPrice: 500 }],
            }]);
        });

        it("활성 옵션이 하나도 없는 활성 그룹은 options: []로 남긴다(min/max 정보 보존)", async () => {
            const item = menu({ optionGroups: [group({ minSelect: 1, options: [option({ isActive: false })] })] });

            const [dto] = (await menuFor([item])).items;

            expect(dto.optionGroups).toEqual([{ id: GROUP_ID, name: "토핑", minSelect: 1, maxSelect: 1, options: [] }]);
        });

        it("추가 가격 0원 옵션도 extraPrice 0으로 준다", async () => {
            const item = menu({ optionGroups: [group({ options: [option({ extraPrice: 0 })] })] });

            const [dto] = (await menuFor([item])).items;

            expect(dto.optionGroups[0].options[0].extraPrice).toBe(0);
        });
    });

    it("메뉴·그룹·옵션을 sort_order 오름차순, 같으면 id 순으로 정렬한다", async () => {
        const items = [
            menu({ id: MENU_ID_3, sortOrder: 2 }),
            menu({ id: MENU_ID_2, sortOrder: 1 }),
            menu({
                id: MENU_ID,
                sortOrder: 2,
                optionGroups: [
                    group({
                        id: GROUP_ID,
                        sortOrder: 5,
                        options: [option({ id: OPTION_ID_2, sortOrder: 0 }), option({ id: OPTION_ID, sortOrder: 0 })],
                    }),
                    group({ id: GROUP_ID_2, sortOrder: 1 }),
                ],
            }),
        ];

        const result = await menuFor(items);

        expect(result.items.map((item) => item.id)).toEqual([MENU_ID_2, MENU_ID, MENU_ID_3]);
        const groups = result.items[1].optionGroups;
        expect(groups.map((g) => g.id)).toEqual([GROUP_ID_2, GROUP_ID]);
        expect(groups[1].options.map((o) => o.id)).toEqual([OPTION_ID, OPTION_ID_2]);
    });

    describe("waitingCount — 전체 미완료 수(F-11 메뉴판)", () => {
        it.each([0, 7])("countWaitingBefore(null) 결과 %i를 그대로 준다", async (count) => {
            const orderRepository = waitingRepository(count);

            const result = await menuFor([menu()], "ko", orderRepository);

            expect(result.waitingCount).toBe(count);
            expect(orderRepository.countWaitingBefore).toHaveBeenCalledTimes(1);
            expect(orderRepository.countWaitingBefore).toHaveBeenCalledWith(null);
        });
    });

    describe("실패 전파", () => {
        it("메뉴 저장소가 실패하면 같은 에러로 실패한다", async () => {
            const failure = new Error("menu_items.list failed");
            const menuRepository = { listMenuItems: vi.fn().mockRejectedValue(failure) };

            await expect(getMenu("ko", { menuRepository, orderRepository: waitingRepository() })).rejects.toBe(failure);
        });

        it("대기 수 조회가 실패하면 같은 에러로 실패한다", async () => {
            const failure = new Error("count_waiting_before failed");
            const orderRepository = { countWaitingBefore: vi.fn().mockRejectedValue(failure) };

            await expect(menuFor([menu()], "ko", orderRepository)).rejects.toBe(failure);
        });
    });
});
