import {
    ADMIN_MENU_LOCALES,
    type AdminMenuDto,
    type AdminMenuOptionGroupDto,
    type AdminMenuPatch,
    type AdminMenusResponse,
    type AdminOptionGroupPatch,
    type AdminOptionPatch,
} from "@/lib/dto/adminMenu";
import { AppError } from "@/lib/api/errors";
import type { AdminMenuRepository, MenuItemRecord, MenuNameTranslation, MenuOptionGroupRecord } from "./ports";

// T-20 관리자 메뉴·재고 관리(Architecture 7절 GET/PATCH /api/admin/menus…, F-25·F-26·F-27).
// 품절은 저장하지 않고 파생한다(F-25: 재고 0 → 품절, 다시 채우면 해제) — 고객 메뉴의 isSoldOut은 menuService가
// is_sold_out_manual OR stock=0으로 계산하므로 여기서는 재고·수동 품절 값만 바꾼다.
// 가격을 바꿔도 이미 만든 주문 금액은 그대로다(주문 금액은 create_order가 주문 시점 값으로 저장).

// sort_order가 같으면 id로 한 번 더 정렬해 요청마다 순서가 같게 한다(menuService와 같은 규칙).
function bySortOrder<T extends { id: string; sortOrder: number }>(list: readonly T[]): T[] {
    return [...list].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        if (a.id === b.id) return 0;
        return a.id < b.id ? -1 : 1;
    });
}

function nameMap(translations: readonly MenuNameTranslation[]): Record<string, { name: string }> {
    const result: Record<string, { name: string }> = {};
    for (const translation of translations) result[translation.locale] = { name: translation.name };
    return result;
}

function toOptionGroupDto(group: MenuOptionGroupRecord): AdminMenuOptionGroupDto {
    return {
        id: group.id,
        translations: nameMap(group.translations),
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isActive: group.isActive,
        options: bySortOrder(group.options).map((option) => ({
            id: option.id,
            translations: nameMap(option.translations),
            extraPrice: option.extraPrice,
            isActive: option.isActive,
        })),
    };
}

// 포트 레코드 → AdminMenuDto. 비활성 메뉴·그룹·옵션도 그대로 담는다(관리 화면은 전체를 본다).
export function toAdminMenuDto(record: MenuItemRecord): AdminMenuDto {
    const translations: AdminMenuDto["translations"] = {};
    for (const translation of record.translations) {
        translations[translation.locale] = { name: translation.name, description: translation.description };
    }
    return {
        id: record.id,
        translations,
        basePrice: record.basePrice,
        stock: record.stock,
        isSoldOutManual: record.isSoldOutManual,
        isActive: record.isActive,
        sortOrder: record.sortOrder,
        imageUrl: record.imageUrl,
        optionGroups: bySortOrder(record.optionGroups).map(toOptionGroupDto),
    };
}

export async function listAdminMenus(repository: AdminMenuRepository): Promise<AdminMenusResponse> {
    const records = await repository.listMenuItems();
    return { menus: bySortOrder(records).map(toAdminMenuDto) };
}

async function readMenu(repository: AdminMenuRepository, menuItemId: string): Promise<AdminMenuDto> {
    const record = await repository.getMenuItem(menuItemId);
    if (!record) throw new AppError("NOT_FOUND", 404);
    return toAdminMenuDto(record);
}

// 보낸 언어만 ko → en 순서로 쓴다.
async function writeNames(
    translations: Partial<Record<(typeof ADMIN_MENU_LOCALES)[number], { name: string }>> | undefined,
    write: (translation: { locale: string; name: string }) => Promise<void>,
) {
    if (!translations) return;
    for (const locale of ADMIN_MENU_LOCALES) {
        const translation = translations[locale];
        if (translation) await write({ locale, name: translation.name });
    }
}

// PATCH /api/admin/menus/{id}: 가격·재고·수동 품절·이름/설명(ko·en). 응답은 고친 뒤의 메뉴 전체.
export async function updateAdminMenu(menuItemId: string, patch: AdminMenuPatch, repository: AdminMenuRepository): Promise<AdminMenuDto> {
    const exists = await repository.updateMenuItem(menuItemId, {
        basePrice: patch.basePrice,
        stock: patch.stock,
        isSoldOutManual: patch.isSoldOutManual,
    });
    if (!exists) throw new AppError("NOT_FOUND", 404);
    if (patch.translations) {
        for (const locale of ADMIN_MENU_LOCALES) {
            const translation = patch.translations[locale];
            if (!translation) continue;
            await repository.upsertMenuTranslation(menuItemId, {
                locale,
                name: translation.name,
                // 빈 설명은 지운다(null), 보내지 않았으면 그대로 둔다(undefined).
                description: translation.description === undefined ? undefined : translation.description || null,
            });
        }
    }
    return readMenu(repository, menuItemId);
}

// PATCH /api/admin/option-groups/{id}: 그룹 이름·최소/최대 선택 수·활성. 응답은 그룹이 속한 메뉴 전체.
export async function updateAdminOptionGroup(
    optionGroupId: string,
    patch: AdminOptionGroupPatch,
    repository: AdminMenuRepository,
): Promise<AdminMenuDto> {
    const group = await repository.findOptionGroup(optionGroupId);
    if (!group) throw new AppError("NOT_FOUND", 404);
    // 하나만 보냈을 때는 저장된 나머지 값과 비교한다(DB CHECK max_select >= min_select를 400으로 먼저 막는다).
    const minSelect = patch.minSelect ?? group.minSelect;
    const maxSelect = patch.maxSelect ?? group.maxSelect;
    if (maxSelect < minSelect) {
        throw new AppError("VALIDATION_ERROR", 400, [{ path: ["maxSelect"], message: "maxSelect must be greater than or equal to minSelect" }]);
    }
    await repository.updateOptionGroup(optionGroupId, { minSelect: patch.minSelect, maxSelect: patch.maxSelect, isActive: patch.isActive });
    await writeNames(patch.translations, (translation) => repository.upsertOptionGroupTranslation(optionGroupId, translation));
    return readMenu(repository, group.menuItemId);
}

// PATCH /api/admin/options/{id}: 옵션 이름·추가 가격·판매 여부(재료가 떨어진 토핑만 잠시 끄기). 응답은 옵션이 속한 메뉴 전체.
export async function updateAdminOption(optionId: string, patch: AdminOptionPatch, repository: AdminMenuRepository): Promise<AdminMenuDto> {
    const menuItemId = await repository.findOptionMenuItemId(optionId);
    if (!menuItemId) throw new AppError("NOT_FOUND", 404);
    await repository.updateOption(optionId, { extraPrice: patch.extraPrice, isActive: patch.isActive });
    await writeNames(patch.translations, (translation) => repository.upsertOptionTranslation(optionId, translation));
    return readMenu(repository, menuItemId);
}
