import { NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { SupabaseSettingsRepository } from "@/infra/repositories/settingsRepository";
import { getAllAdminSettings, updateAdminSettings } from "@/services/settingsService";
import { UpdateAdminSettingsRequestSchema } from "@/lib/dto/settings";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";

export const dynamic = "force-dynamic";

/**
 * Architecture 7절: GET /api/admin/settings
 * - 전체 설정 조회
 * - 인증된 관리자만 접근 가능 (비인증 시 401 UNAUTHORIZED)
 */
export const GET = withHandler(
    async (_request?: Request) => {
        await requireAdmin();
        const repository = new SupabaseSettingsRepository();
        const settings = await getAllAdminSettings(repository);
        return NextResponse.json(
            { settings },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    },
    { route: "/api/admin/settings" },
);

/**
 * Architecture 7절: PUT /api/admin/settings
 * - 관리자 설정 부분 갱신 (전달된 키만 upsert, 나머지 유지)
 * - ADR-0004 키만 허용, 알 수 없는 키 400 VALIDATION_ERROR
 * - 키별 zod 검증 실패 시 400 VALIDATION_ERROR
 * - 인증된 관리자만 접근 가능 (비인증 시 401 UNAUTHORIZED)
 */
export const PUT = withHandler(
    async (request: Request) => {
        const user = await requireAdmin();

        const body: unknown = await request.json().catch(() => {
            throw new AppError("VALIDATION_ERROR", 400, "Invalid JSON");
        });

        const parsed = UpdateAdminSettingsRequestSchema.safeParse(body);
        if (!parsed.success) {
            throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
        }

        const repository = new SupabaseSettingsRepository();
        const settings = await updateAdminSettings(repository, parsed.data.settings, user?.id);

        return NextResponse.json(
            { settings },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    },
    { route: "/api/admin/settings" },
);
