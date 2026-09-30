import { z } from "zod";
import { AppError } from "./errors";

// 동적 라우트의 uuid 파라미터 검증.
// 형식이 틀린 id를 그대로 Supabase `.eq("id", id)`에 넘기면 PostgREST가 22P02(invalid uuid)를
// 반환하고, 리포지토리의 toError가 이를 매핑하지 않아 500 INTERNAL_ERROR가 된다.
// 라우트 진입부에서 먼저 걸러 400 VALIDATION_ERROR로 응답한다.
// 호출 순서: requireAdmin() 이후에 호출해야 미인증 요청이 401을 먼저 받는다.
export function parseUuidParam(value: string | undefined, name: string = "id"): string {
    // 파라미터 자체가 없으면 기존 라우트 동작(404 NOT_FOUND)을 유지한다.
    if (!value) {
        throw new AppError("NOT_FOUND", 404);
    }

    // z.uuid()가 아니라 z.guid()를 쓴다: Zod 4의 z.uuid()는 RFC variant 비트까지 검사해
    // PostgreSQL uuid 컬럼엔 정상 저장되는 seed ID(예: 11111111-1111-1111-1111-111111111111)도 거부한다.
    // 목적은 22P02(형식 오류) 차단이므로 8-4-4-4-12 hex 형태만 확인하는 z.guid()로 충분하다.
    // object 스키마로 감싸 issues의 path에 파라미터 이름이 담기게 한다
    // (POST /api/orders가 details로 parsed.error.issues를 내려주는 형식과 동일).
    const parsed = z.object({ [name]: z.guid() }).safeParse({ [name]: value });
    if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
    }

    return value;
}
