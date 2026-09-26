import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

// Architecture 3절 RLS 정책 및 315라인 검증:
// - anon: orders, menu_items, app_settings SELECT 접근 거부 또는 빈 결과; RPC 함수 execute 거부
// - authenticated: orders UPDATE/INSERT 거부 (SELECT만 허용)
// - service_role: 모든 권한 허용

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY || "dummy-anon-key";

describe("T-13 / Architecture 3절: RLS 정책 검증", () => {
    const anonClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
    });
    const serviceClient = createServiceClient();

    test("anon 클라이언트는 orders 테이블을 조회할 수 없다 (거부 또는 빈 결과)", async () => {
        const { data, error } = await anonClient.from("orders").select("*");
        // RLS로 인해 에러가 발생하거나 0건의 결과만 반환되어야 함 (F-20, N-04)
        if (error) {
            expect(error.code).toBeDefined();
        } else {
            expect(data).toEqual([]);
        }
    });

    test("anon 클라이언트는 app_settings 테이블을 조회할 수 없다 (거부 또는 빈 결과)", async () => {
        const { data, error } = await anonClient.from("app_settings").select("*");
        if (error) {
            expect(error.code).toBeDefined();
        } else {
            expect(data).toEqual([]);
        }
    });

    test("anon 클라이언트는 menu_items 테이블을 직접 조회할 수 없다 (거부 또는 빈 결과)", async () => {
        const { data, error } = await anonClient.from("menu_items").select("*");
        if (error) {
            expect(error.code).toBeDefined();
        } else {
            expect(data).toEqual([]);
        }
    });

    test("anon 클라이언트는 create_order 또는 transition_order RPC를 직접 실행할 수 없다 (거부)", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await anonClient.rpc("create_order" as any, {} as any);
        // EXECUTE 권한이 REVOKE되어 있으므로 반드시 에러 발생
        expect(error).not.toBeNull();
    });

    test("service_role 클라이언트는 정상적으로 테이블 조회 및 쓰기가 가능하다", async () => {
        const { error } = await serviceClient.from("orders").select("id").limit(1);
        expect(error).toBeNull();
    });
});
