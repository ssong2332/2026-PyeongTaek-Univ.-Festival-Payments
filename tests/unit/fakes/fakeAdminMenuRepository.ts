import type { AdminMenuRepository, MenuItemRecord, MenuRepository } from "@/services/ports";

// 관리자 메뉴 저장소(T-20)의 메모리 구현. 같은 데이터를 고객 메뉴 저장소(menuRepository)로도 읽을 수 있어
// "관리자가 재고를 0으로 → 고객 메뉴판 품절" 같은 흐름을 서비스끼리 이어서 확인한다.
// 조회는 매번 복사본을 돌려준다(서비스가 받은 값을 바꿔도 저장소에 영향 없음).
export function createFakeAdminMenuRepository(initial: MenuItemRecord[] = []) {
    const items: MenuItemRecord[] = structuredClone(initial);
    const calls: string[] = [];

    const findGroup = (id: string) => {
        for (const item of items) {
            const group = item.optionGroups.find((candidate) => candidate.id === id);
            if (group) return { item, group };
        }
        return null;
    };
    const findOption = (id: string) => {
        for (const item of items) {
            for (const group of item.optionGroups) {
                const option = group.options.find((candidate) => candidate.id === id);
                if (option) return { item, option };
            }
        }
        return null;
    };
    const upsertName = (translations: { locale: string; name: string }[], locale: string, name: string) => {
        const existing = translations.find((translation) => translation.locale === locale);
        if (existing) existing.name = name;
        else translations.push({ locale, name });
    };

    const repository: AdminMenuRepository = {
        async listMenuItems() {
            calls.push("listMenuItems");
            return structuredClone(items);
        },
        async getMenuItem(id) {
            calls.push("getMenuItem");
            const item = items.find((candidate) => candidate.id === id);
            return item ? structuredClone(item) : null;
        },
        async updateMenuItem(id, patch) {
            calls.push("updateMenuItem");
            const item = items.find((candidate) => candidate.id === id);
            if (!item) return false;
            if (patch.basePrice !== undefined) item.basePrice = patch.basePrice;
            if (patch.stock !== undefined) item.stock = patch.stock;
            if (patch.isSoldOutManual !== undefined) item.isSoldOutManual = patch.isSoldOutManual;
            return true;
        },
        async upsertMenuTranslation(menuItemId, translation) {
            calls.push(`upsertMenuTranslation:${translation.locale}`);
            const item = items.find((candidate) => candidate.id === menuItemId);
            if (!item) throw new Error("menu not found");
            const existing = item.translations.find((candidate) => candidate.locale === translation.locale);
            if (existing) {
                existing.name = translation.name;
                if (translation.description !== undefined) existing.description = translation.description;
            } else {
                item.translations.push({ locale: translation.locale, name: translation.name, description: translation.description ?? null });
            }
        },
        async findOptionGroup(id) {
            calls.push("findOptionGroup");
            const found = findGroup(id);
            return found ? { menuItemId: found.item.id, minSelect: found.group.minSelect, maxSelect: found.group.maxSelect } : null;
        },
        async updateOptionGroup(id, patch) {
            calls.push("updateOptionGroup");
            const found = findGroup(id);
            if (!found) throw new Error("group not found");
            if (patch.minSelect !== undefined) found.group.minSelect = patch.minSelect;
            if (patch.maxSelect !== undefined) found.group.maxSelect = patch.maxSelect;
            if (patch.isActive !== undefined) found.group.isActive = patch.isActive;
        },
        async upsertOptionGroupTranslation(optionGroupId, translation) {
            calls.push(`upsertOptionGroupTranslation:${translation.locale}`);
            const found = findGroup(optionGroupId);
            if (!found) throw new Error("group not found");
            upsertName(found.group.translations, translation.locale, translation.name);
        },
        async findOptionMenuItemId(id) {
            calls.push("findOptionMenuItemId");
            return findOption(id)?.item.id ?? null;
        },
        async updateOption(id, patch) {
            calls.push("updateOption");
            const found = findOption(id);
            if (!found) throw new Error("option not found");
            if (patch.extraPrice !== undefined) found.option.extraPrice = patch.extraPrice;
            if (patch.isActive !== undefined) found.option.isActive = patch.isActive;
        },
        async upsertOptionTranslation(optionId, translation) {
            calls.push(`upsertOptionTranslation:${translation.locale}`);
            const found = findOption(optionId);
            if (!found) throw new Error("option not found");
            upsertName(found.option.translations, translation.locale, translation.name);
        },
    };

    const menuRepository: MenuRepository = {
        async listMenuItems() {
            return structuredClone(items);
        },
    };

    return { repository, menuRepository, items, calls };
}
