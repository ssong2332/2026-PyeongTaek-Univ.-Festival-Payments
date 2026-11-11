import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
import type {
    MenuItemDto,
    MenuLocale,
    MenuOptionDto,
    MenuOptionGroupDto,
    MenuResponse,
} from "@/lib/dto/menu";
import type {
    MenuItemRecord,
    MenuItemTranslation,
    MenuNameTranslation,
    MenuOptionGroupRecord,
    MenuOptionRecord,
    MenuRepository,
    OrderRepository,
} from "./ports";

function hasText(value: string | null | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isPresent<T>(value: T | null): value is T {
    return value !== null;
}

function findLocale<T extends MenuNameTranslation>(translations: T[], locale: string): T | undefined {
    return translations.find((translation) => translation.locale === locale);
}

// 요청 언어 → ko 폴백, 빈 문자열 0건(ADR-0005, F-05). 공백뿐인 이름도 누락으로 본다.
// ko 이름이 없으면 null → 호출부가 항목을 뺀다. create_order(0010)가 ko 이름 없는 메뉴는 MENU_UNAVAILABLE,
// ko 이름 없는 그룹·옵션은 INVALID_OPTION으로 거부하므로, 주문할 수 없는 항목을 메뉴판에 보이지 않는다.
function localizedName(translations: MenuNameTranslation[], locale: MenuLocale): string | null {
    const fallback = findLocale(translations, DEFAULT_LOCALE)?.name;
    if (!hasText(fallback)) return null;
    const requested = findLocale(translations, locale)?.name;
    return hasText(requested) ? requested : fallback;
}

function localizedDescription(translations: MenuItemTranslation[], locale: MenuLocale): string | null {
    const requested = findLocale(translations, locale)?.description;
    if (hasText(requested)) return requested;
    const fallback = findLocale(translations, DEFAULT_LOCALE)?.description;
    return hasText(fallback) ? fallback : null;
}

// sort_order가 같으면 id로 한 번 더 정렬해 요청마다 순서가 같게 한다.
function bySortOrder<T extends { id: string; sortOrder: number }>(list: T[]): T[] {
    return [...list].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        if (a.id === b.id) return 0;
        return a.id < b.id ? -1 : 1;
    });
}

function toMenuOptionDto(option: MenuOptionRecord, locale: MenuLocale): MenuOptionDto | null {
    const name = localizedName(option.translations, locale);
    if (name === null) return null;
    return { id: option.id, name, extraPrice: option.extraPrice };
}

// 활성 옵션이 0개인 그룹도 남긴다 — 명세에 없는 제외를 더하지 않고, 화면이 minSelect로 담기 가능 여부를 판단하게 한다.
function toMenuOptionGroupDto(group: MenuOptionGroupRecord, locale: MenuLocale): MenuOptionGroupDto | null {
    const name = localizedName(group.translations, locale);
    if (name === null) return null;
    return {
        id: group.id,
        name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: bySortOrder(group.options.filter((option) => option.isActive))
            .map((option) => toMenuOptionDto(option, locale))
            .filter(isPresent),
    };
}

// Architecture 6절: isSoldOut = is_sold_out_manual OR stock=0, isAvailable = !isSoldOut.
// stock은 CHECK(stock >= 0)이라 `<= 0`은 `= 0`과 같다 — 음수가 들어와도 판매 가능으로 보이지 않게 한다.
function toMenuItemDto(item: MenuItemRecord, locale: MenuLocale): MenuItemDto | null {
    const name = localizedName(item.translations, locale);
    if (name === null) return null;
    const isSoldOut = item.isSoldOutManual || item.stock <= 0;
    return {
        id: item.id,
        name,
        description: localizedDescription(item.translations, locale),
        price: item.basePrice,
        stock: item.stock,
        isRecommended: item.isRecommended,
        isAvailable: !isSoldOut,
        isSoldOut,
        imageUrl: item.imageUrl,
        optionGroups: bySortOrder(item.optionGroups.filter((group) => group.isActive))
            .map((group) => toMenuOptionGroupDto(group, locale))
            .filter(isPresent),
    };
}

// Architecture "고객 API" GET /api/menu (F-01, F-05, F-11, F-25, F-26).
export async function getMenu(
    locale: MenuLocale,
    deps: {
        menuRepository: MenuRepository;
        orderRepository: Pick<OrderRepository, "countWaitingBefore">;
    },
): Promise<MenuResponse> {
    const [menuItems, waitingCount] = await Promise.all([
        deps.menuRepository.listMenuItems(),
        // 전체 미완료 수. /api/queue(getQueueStatus)와 같은 정의여야 메뉴판 첫 값과 30초 갱신 값이 어긋나지 않는다.
        deps.orderRepository.countWaitingBefore(null),
    ]);

    const items = bySortOrder(menuItems.filter((item) => item.isActive))
        .map((item) => toMenuItemDto(item, locale))
        .filter(isPresent);

    return { items, waitingCount, locale };
}
