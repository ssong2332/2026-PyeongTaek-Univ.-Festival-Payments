"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    AdminMenuSchema,
    AdminMenusResponseSchema,
    type AdminMenuDto,
    type AdminMenuCreate,
    type AdminMenuPatch,
    type AdminOptionGroupPatch,
    type AdminOptionPatch,
} from "@/lib/dto/adminMenu";

// T-20 관리자 메뉴·재고 관리 화면 — GET/PATCH /api/admin/menus·option-groups·options (Architecture 7절 계약, 8절 "useMenuAdmin").
// 메뉴 API가 없는 이전 배포를 만나 목록 조회가 404면 오류 대신 "연결하지 못함"으로 보여 준다(status "unavailable").
// 세션이 끝나 401이 오면 로그인 화면으로 보낸다(PRD 화면 절 "권한없음: 로그인 화면으로 리다이렉트").

export class MenuAdminRequestError extends Error {
    constructor(readonly status: number) {
        super(`Menu admin request failed: ${status}`);
        this.name = "MenuAdminRequestError";
    }
}

export interface MenuAdminApi {
    load: () => Promise<AdminMenuDto[]>;
    createMenu: (input: AdminMenuCreate) => Promise<AdminMenuDto>;
    updateMenu: (id: string, patch: AdminMenuPatch) => Promise<AdminMenuDto>;
    updateOptionGroup: (id: string, patch: AdminOptionGroupPatch) => Promise<AdminMenuDto>;
    updateOption: (id: string, patch: AdminOptionPatch) => Promise<AdminMenuDto>;
}

async function request(url: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(url, { cache: "no-store", ...init });
    if (!response.ok) throw new MenuAdminRequestError(response.status);
    return response.json();
}

function patchJson(url: string, body: unknown) {
    return request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export const menuAdminApi: MenuAdminApi = {
    async load() {
        return AdminMenusResponseSchema.parse(await request("/api/admin/menus")).menus;
    },
    async createMenu(input) {
        return AdminMenuSchema.parse(await request("/api/admin/menus", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
        }));
    },
    async updateMenu(id, patch) {
        return AdminMenuSchema.parse(await patchJson(`/api/admin/menus/${encodeURIComponent(id)}`, patch));
    },
    async updateOptionGroup(id, patch) {
        return AdminMenuSchema.parse(await patchJson(`/api/admin/option-groups/${encodeURIComponent(id)}`, patch));
    },
    async updateOption(id, patch) {
        return AdminMenuSchema.parse(await patchJson(`/api/admin/options/${encodeURIComponent(id)}`, patch));
    },
};

// 저장 실패 안내 문구(화면 공통)
export function menuSaveErrorMessage(error: unknown): string {
    if (error instanceof MenuAdminRequestError) {
        if (error.status === 400) return "입력값을 확인해 주세요.";
        if (error.status === 404) return "메뉴를 찾을 수 없어요. 새로고침해 주세요.";
        if (error.status === 401) return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    }
    return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

// 목록 API 자체가 없으면(404) 오류가 아니라 "아직 준비 중"
function loadFailureStatus(error: unknown): "error" | "unavailable" {
    return error instanceof MenuAdminRequestError && error.status === 404 ? "unavailable" : "error";
}

// 서로 다른 메뉴 관리 패널(기존 편집 + T-37 추가/판매상태)이 저장 뒤 같은 목록을 다시 읽게 한다.
export const MENU_ADMIN_CHANGED_EVENT = "ptu:menu-admin-changed";
export function notifyMenuAdminChanged() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(MENU_ADMIN_CHANGED_EVENT));
}

// 세션이 끝난 요청(401)이면 로그인 화면으로 보낸다(근무 관리 화면과 같은 방식).
// 돌려주는 함수는 렌더가 바뀌어도 같다 — 목록 불러오기 effect가 이 함수 때문에 다시 돌지 않게 한다.
export function useLoginRedirect() {
    const router = useRouter();
    const routerRef = useRef(router);
    useEffect(() => {
        routerRef.current = router;
    }, [router]);
    return useCallback((error: unknown) => {
        if (error instanceof MenuAdminRequestError && error.status === 401) routerRef.current.replace("/admin/login");
    }, []);
}

export function useMenuAdmin(api: MenuAdminApi = menuAdminApi) {
    const redirectIfExpired = useLoginRedirect();
    const [status, setStatus] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
    const [menus, setMenus] = useState<AdminMenuDto[]>([]);

    const reload = useCallback(async () => {
        setStatus("loading");
        try {
            setMenus(await api.load());
            setStatus("ready");
        } catch (error) {
            redirectIfExpired(error);
            setStatus(loadFailureStatus(error));
        }
    }, [api, redirectIfExpired]);

    useEffect(() => {
        let active = true;
        api.load().then(
            (loaded) => {
                if (!active) return;
                setMenus(loaded);
                setStatus("ready");
            },
            (error: unknown) => {
                if (!active) return;
                redirectIfExpired(error);
                setStatus(loadFailureStatus(error));
            },
        );
        return () => {
            active = false;
        };
    }, [api, redirectIfExpired]);

    useEffect(() => {
        const handleChange = () => { void reload(); };
        window.addEventListener(MENU_ADMIN_CHANGED_EVENT, handleChange);
        return () => window.removeEventListener(MENU_ADMIN_CHANGED_EVENT, handleChange);
    }, [reload]);

    const addMenu = useCallback((created: AdminMenuDto) => {
        setMenus((previous) => [...previous, created].toSorted((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)));
    }, []);

    // 저장 응답(고친 뒤의 메뉴 전체)으로 목록의 그 메뉴만 바꾼다.
    const replaceMenu = useCallback((updated: AdminMenuDto) => {
        setMenus((previous) => previous.map((menu) => (menu.id === updated.id ? updated : menu)));
    }, []);

    return { status, menus, reload, addMenu, replaceMenu, api };
}
