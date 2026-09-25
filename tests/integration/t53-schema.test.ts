import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const T53_MIGRATION = "0008_t53_remove_easy_pay.sql";
const MIGRATIONS_DIR = "supabase/migrations";
const UPGRADE_DB = "t53_upgrade_test";

function runPsql(sql: string): string {
    const config = readFileSync("supabase/config.toml", "utf8");
    const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/m.exec(config)?.[1];
    if (!projectId) {
        throw new Error("테스트 DB의 Supabase project_id를 확인할 수 없습니다.");
    }
    return execFileSync("docker", [
        "exec", "-i", `supabase_db_${projectId}`,
        "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    ], { input: sql, encoding: "utf8", timeout: 60_000, stdio: ["pipe", "pipe", "pipe"] });
}

// T-53 이전 마이그레이션만 적용한 별도 DB를 만들고 fixture 뒤에 T-53을 적용한다.
function upgradeScript(fixtureSql: string, checkSql: string): string {
    const earlier = readdirSync(MIGRATIONS_DIR)
        .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < T53_MIGRATION)
        .sort()
        .map((name) => readFileSync(`${MIGRATIONS_DIR}/${name}`, "utf8"));
    return [
        `DROP DATABASE IF EXISTS ${UPGRADE_DB};`,
        `CREATE DATABASE ${UPGRADE_DB};`,
        `\\connect ${UPGRADE_DB}`,
        ...earlier,
        fixtureSql,
        readFileSync(`${MIGRATIONS_DIR}/${T53_MIGRATION}`, "utf8"),
        checkSql,
        "\\connect postgres",
        `DROP DATABASE ${UPGRADE_DB};`,
    ].join("\n");
}

function dropUpgradeDb(): void {
    runPsql(`DROP DATABASE IF EXISTS ${UPGRADE_DB};`);
}

test("T-53 적용 후 결제수단·환불수단·설정 키가 현금·계좌이체 기준이다", () => {
    const output = runPsql(readFileSync("tests/integration/t53-schema.sql", "utf8"));
    expect(output).toContain("ROLLBACK");
}, 70_000);

test("T-53은 기존 DB의 간편결제 설정 키를 지워 설정 6개만 남기고 주문은 보존한다", () => {
    try {
        const output = runPsql(upgradeScript(
            readFileSync("tests/integration/t53-upgrade-fixture.sql", "utf8"),
            readFileSync("tests/integration/t53-upgrade-check.sql", "utf8"),
        ));
        expect(output).toContain("DROP DATABASE");
    } finally {
        dropUpgradeDb();
    }
}, 70_000);

test("kakaopay 환불 기록이 남아 있으면 T-53은 추측 변환 없이 중단한다", () => {
    const fixture = `INSERT INTO public.orders
        (pickup_number, status, payment_method, transfer_method, total_amount,
         idempotency_key, status_token, refund_channel)
        VALUES (1, 'refunded', 'transfer', 'kakaopay', 3000, gen_random_uuid(), repeat('k', 64), 'kakaopay');`;
    try {
        expect(() => runPsql(upgradeScript(fixture, ""))).toThrow(/T-53: orders\.refund_channel/);
    } finally {
        dropUpgradeDb();
    }
}, 70_000);
