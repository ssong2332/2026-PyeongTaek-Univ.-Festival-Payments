import type { MenuItemDto } from "@/lib/dto/menu";

// 메뉴 수가 적어 서버 검색 없이 이미 받은 목록을 거른다(팀장 결정 2026-10-01).
// 띄어쓰기·영문 대소문자 차이는 무시하고, 이름 또는 설명에 들어 있으면 찾는다.
function normalize(text: string): string {
    return text.normalize("NFC").toLowerCase().replace(/\s+/g, "");
}

export function filterMenuItems(items: readonly MenuItemDto[], query: string): MenuItemDto[] {
    const needle = normalize(query);
    if (needle === "") return [...items];
    return items.filter((item) => normalize(item.name).includes(needle) || normalize(item.description ?? "").includes(needle));
}
