import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("T-03 스키마 제약과 역할별 RLS를 실제 로컬 DB에서 검증한다", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/m.exec(config)?.[1];
    if (!projectId) {
        throw new Error("테스트 DB의 Supabase project_id를 확인할 수 없습니다.");
    }
    const sql = readFileSync("tests/integration/t03-schema.sql", "utf8");
    const output = execFileSync("docker", [
        "exec", "-i", `supabase_db_${projectId}`,
        "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    ], { input: sql, encoding: "utf8", timeout: 30_000 });
    expect(output).toContain("ROLLBACK");
}, 40_000);
