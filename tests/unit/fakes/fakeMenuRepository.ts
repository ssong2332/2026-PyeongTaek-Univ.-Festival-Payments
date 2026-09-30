import type { MenuItemRecord, MenuRepository } from "@/services/ports";

// 서비스가 받은 배열을 바꿔도 다음 조회에 영향이 없도록 매번 복사본을 돌려준다.
export function createFakeMenuRepository(items: MenuItemRecord[] = []): MenuRepository {
    return {
        async listMenuItems() {
            return structuredClone(items);
        },
    };
}
