import { expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

test("Supabase 인증 서비스와 DB에 읽기 요청으로 연결한다", async () => {
    const client = createServiceClient();
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
        throw new Error("Supabase 연결 검사 실패: 프로젝트 주소·서버 키·서비스 실행 상태를 확인하세요.");
    }
    expect(Array.isArray(data.users)).toBe(true);
});
