// 메뉴 사진(프론트 담당 제공, 2026-10-05) — public/images/menu/*.webp, 720×720.
// DB menu_items.image_url이 비어 있으면(시드 기본값) 메뉴 ID로 여기서 찾는다. 관리자가 image_url을 넣으면 그 값이 우선이다.
const MENU_IMAGE_BY_ID: Readonly<Record<string, string>> = {
    "11111111-1111-1111-1111-111111111111": "/images/menu/original.webp", // 기본 호떡
    "55555555-5555-5555-5555-555555555555": "/images/menu/honey-butter.webp", // 허니버터 호떡
    "66666666-6666-6666-6666-666666666666": "/images/menu/cheddar.webp", // 체다치즈 호떡
    "77777777-7777-7777-7777-777777777777": "/images/menu/consomme.webp", // 콘소메 호떡
    "22222222-2222-2222-2222-222222222222": "/images/menu/bburinkle.webp", // 뿌링클 호떡
    "88888888-8888-8888-8888-888888888888": "/images/menu/corn-cheese.webp", // 콘치즈 호떡
    "99999999-9999-9999-9999-999999999999": "/images/menu/sweet-potato-cheese.webp", // 고구마 치즈 호떡
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": "/images/menu/black-sesame.webp", // 흑임자 콩가루 호떡
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb": "/images/menu/buldak-corn-cheese.webp", // 불닭 콘치즈 호떡
    "cccccccc-cccc-cccc-cccc-cccccccccccc": "/images/menu/matcha-white-choco.webp", // 말차 화이트초코 호떡
};

export function menuImageUrl(menuItemId: string, imageUrl: string | null): string | null {
    return imageUrl ?? MENU_IMAGE_BY_ID[menuItemId] ?? null;
}
