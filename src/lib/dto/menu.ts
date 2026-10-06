import { z } from "zod";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/domain/i18n/locales";

// Architecture "6. 고객 API" GET /api/menu?lang=ko. 언어 목록은 SUPPORTED_LOCALES(domain/i18n/locales).
const MenuLocaleSchema = z.enum(SUPPORTED_LOCALES);
export type MenuLocale = z.infer<typeof MenuLocaleSchema>;

// 없으면 기본 언어(ko). 목록 밖 값(빈 문자열·대문자 포함)은 400 VALIDATION_ERROR.
export const MenuQuerySchema = z.strictObject({
    lang: MenuLocaleSchema.default(DEFAULT_LOCALE),
});

// 메뉴·옵션 ID는 DB가 만든 값이라 z.guid()로 검사한다(시드 ID 11111111-… 허용 — lib/dto/order.ts 주석 참고).
export const MenuOptionDtoSchema = z.object({
    id: z.guid(),
    name: z.string().min(1),
    extraPrice: z.int().nonnegative(),
});
export type MenuOptionDto = z.infer<typeof MenuOptionDtoSchema>;

export const MenuOptionGroupDtoSchema = z.object({
    id: z.guid(),
    name: z.string().min(1),
    minSelect: z.int().nonnegative(),
    maxSelect: z.int().nonnegative(),
    options: z.array(MenuOptionDtoSchema),
});
export type MenuOptionGroupDto = z.infer<typeof MenuOptionGroupDtoSchema>;

export const MenuItemDtoSchema = z.object({
    id: z.guid(),
    name: z.string().min(1),
    description: z.string().nullable(),
    price: z.int().nonnegative(),
    stock: z.int().nonnegative(),
    isRecommended: z.boolean(),
    isAvailable: z.boolean(),
    isSoldOut: z.boolean(),
    imageUrl: z.string().nullable(),
    optionGroups: z.array(MenuOptionGroupDtoSchema),
});
export type MenuItemDto = z.infer<typeof MenuItemDtoSchema>;

export const MenuResponseSchema = z.object({
    items: z.array(MenuItemDtoSchema),
    waitingCount: z.int().nonnegative(),
    locale: MenuLocaleSchema,
});
export type MenuResponse = z.infer<typeof MenuResponseSchema>;
