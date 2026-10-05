import { z } from "zod";

// T-20 (F-25·F-26·F-27): 관리자 메뉴·재고 관리 API의 요청·응답 형태 — Architecture 7절 계약.
// 라우트(src/app/api/admin/menus…)는 요청을 이 스키마로 검사하고, 화면(useMenuAdmin)은 응답을 검사한다.
// 1차는 기존 메뉴 수정만 — 메뉴 추가·삭제(활성 끄기)는 2차(T-37)라 메뉴 PATCH에 isActive가 없다.

export const ADMIN_MENU_LOCALES = ["ko", "en"] as const;
export type AdminMenuLocale = (typeof ADMIN_MENU_LOCALES)[number];

// 입력 한도 — 화면 문구·검증이 같은 값을 쓴다.
export const ADMIN_MENU_LIMITS = {
    nameMax: 40,
    descriptionMax: 200,
    priceMax: 1_000_000,
    stockMax: 100_000,
    extraPriceMax: 100_000,
    selectMax: 20,
} as const;

// ── 응답 ─────────────────────────────────────────────────────────────

const NameTranslationSchema = z.object({ name: z.string() });
const MenuTranslationSchema = z.object({ name: z.string(), description: z.string().nullable() });

export const AdminMenuOptionSchema = z.object({
    id: z.string(),
    translations: z.record(z.string(), NameTranslationSchema),
    extraPrice: z.number().int(),
    isActive: z.boolean(),
});

export const AdminMenuOptionGroupSchema = z.object({
    id: z.string(),
    translations: z.record(z.string(), NameTranslationSchema),
    minSelect: z.number().int(),
    maxSelect: z.number().int(),
    isActive: z.boolean(),
    options: z.array(AdminMenuOptionSchema),
});

export const AdminMenuSchema = z.object({
    id: z.string(),
    translations: z.record(z.string(), MenuTranslationSchema),
    basePrice: z.number().int(),
    stock: z.number().int(),
    isSoldOutManual: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    imageUrl: z.string().nullable(),
    optionGroups: z.array(AdminMenuOptionGroupSchema),
});

export const AdminMenusResponseSchema = z.object({ menus: z.array(AdminMenuSchema) });

export type AdminMenuOptionDto = z.infer<typeof AdminMenuOptionSchema>;
export type AdminMenuOptionGroupDto = z.infer<typeof AdminMenuOptionGroupSchema>;
export type AdminMenuDto = z.infer<typeof AdminMenuSchema>;
export type AdminMenusResponse = z.infer<typeof AdminMenusResponseSchema>;

// ── 요청 ─────────────────────────────────────────────────────────────

// 이름은 앞뒤 공백을 지운 뒤 1자 이상 — 공백만 있는 이름(빈칸 번역)은 400(Architecture: ko name 빈값 → 400).
const NameSchema = z.string().trim().min(1).max(ADMIN_MENU_LIMITS.nameMax);

const MenuTranslationPatchSchema = z.strictObject({
    name: NameSchema,
    // 빈 문자열이면 설명을 지운다(null 저장).
    description: z.string().trim().max(ADMIN_MENU_LIMITS.descriptionMax).optional(),
});

const NameTranslationPatchSchema = z.strictObject({ name: NameSchema });

function translationsPatch<T extends z.ZodType>(schema: T) {
    return z
        .strictObject({ ko: schema.optional(), en: schema.optional() })
        .refine((value) => Object.keys(value).length > 0, { message: "translations must include ko or en" });
}

const nonEmpty = (value: object) => Object.keys(value).length > 0;
const NO_FIELDS = { message: "at least one field is required" };

export const AdminMenuPatchSchema = z
    .strictObject({
        basePrice: z.number().int().min(0).max(ADMIN_MENU_LIMITS.priceMax).optional(),
        stock: z.number().int().min(0).max(ADMIN_MENU_LIMITS.stockMax).optional(),
        isSoldOutManual: z.boolean().optional(),
        translations: translationsPatch(MenuTranslationPatchSchema).optional(),
    })
    .refine(nonEmpty, NO_FIELDS);

export const AdminOptionGroupPatchSchema = z
    .strictObject({
        translations: translationsPatch(NameTranslationPatchSchema).optional(),
        minSelect: z.number().int().min(0).max(ADMIN_MENU_LIMITS.selectMax).optional(),
        maxSelect: z.number().int().min(1).max(ADMIN_MENU_LIMITS.selectMax).optional(),
        isActive: z.boolean().optional(),
    })
    .refine(nonEmpty, NO_FIELDS)
    // 둘 다 보냈을 때는 여기서, 하나만 보냈을 때는 서비스가 저장된 값과 비교한다.
    .refine((value) => value.minSelect === undefined || value.maxSelect === undefined || value.maxSelect >= value.minSelect, {
        message: "maxSelect must be greater than or equal to minSelect",
        path: ["maxSelect"],
    });

export const AdminOptionPatchSchema = z
    .strictObject({
        translations: translationsPatch(NameTranslationPatchSchema).optional(),
        extraPrice: z.number().int().min(0).max(ADMIN_MENU_LIMITS.extraPriceMax).optional(),
        isActive: z.boolean().optional(),
    })
    .refine(nonEmpty, NO_FIELDS);

export type AdminMenuPatch = z.infer<typeof AdminMenuPatchSchema>;
export type AdminOptionGroupPatch = z.infer<typeof AdminOptionGroupPatchSchema>;
export type AdminOptionPatch = z.infer<typeof AdminOptionPatchSchema>;
