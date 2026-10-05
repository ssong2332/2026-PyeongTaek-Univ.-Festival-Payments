import type { z } from "zod";
import { AppError } from "./errors";

// JSON 본문을 읽어 zod 스키마로 검사한다. 본문이 없거나 JSON이 아니거나 스키마에 맞지 않으면 400 VALIDATION_ERROR
// (details에 zod issues). 라우트는 requireAdmin() 다음에 불러 미인증 요청이 401을 먼저 받게 한다.
export async function parseJsonBody<T extends z.ZodType>(request: Request | undefined, schema: T): Promise<z.infer<T>> {
    if (!request) throw new AppError("VALIDATION_ERROR", 400);
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new AppError("VALIDATION_ERROR", 400);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
    return parsed.data;
}
