import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execFileAsync = promisify(execFile);

// 동시성 검사용 고정 ID(07e…). 커밋되는 데이터라 테스트마다 finally에서 지운다.
const MENU_ONE = "07e00000-0000-4000-8000-000000000001";
const MENU_FIVE = "07e00000-0000-4000-8000-000000000005";
const MENU_SOLD_OUT = "07e00000-0000-4000-8000-00000000000d";
const KEY_PREFIX = "07e10000-0000-4000-8000-";

function psqlArgs(): string[] {
    const config = readFileSync("supabase/config.toml", "utf8");
    const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/m.exec(config)?.[1];
    if (!projectId) {
        throw new Error("테스트 DB의 Supabase project_id를 확인할 수 없습니다.");
    }
    return [
        "exec", "-i", `supabase_db_${projectId}`,
        "psql", "-X", "-q", "-t", "-A", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    ];
}

function runPsql(sql: string): string {
    return execFileSync("docker", psqlArgs(), {
        input: sql, encoding: "utf8", timeout: 60_000, stdio: ["pipe", "pipe", "pipe"],
    });
}

// 별도 세션에서 create_order를 호출하고 잠금을 잠시 쥔 채 커밋한다 → 두 세션이 실제로 겹친다.
async function createOrderInSession(key: string, menuId: string, quantity: number): Promise<string> {
    const sql = [
        "SET ROLE service_role;",
        "BEGIN;",
        `SELECT public.create_order('${key}', 'cash', 'ko',
            '[{"menuItemId":"${menuId}","quantity":${quantity},"optionIds":[]}]');`,
        "SELECT pg_sleep(0.5);",
        "COMMIT;",
    ].join("\n");
    const child = execFileAsync("docker", psqlArgs(), { encoding: "utf8", timeout: 60_000 });
    child.child.stdin?.end(sql);
    const { stdout } = await child;
    return stdout.split("\n").find((line) => line.startsWith("{")) ?? "";
}

function key(n: number): string {
    return `${KEY_PREFIX}${String(n).padStart(12, "0")}`;
}

function setUpMenus(): void {
    runPsql(`
        CREATE TABLE IF NOT EXISTS public.t07_counter_backup AS
            SELECT value FROM public.counters WHERE key = 'pickup_number';
        INSERT INTO public.menu_items (id, base_price, stock, is_sold_out_manual) VALUES
            ('${MENU_ONE}', 3000, 1, false), ('${MENU_FIVE}', 3000, 5, false), ('${MENU_SOLD_OUT}', 3000, 5, true);
        INSERT INTO public.menu_item_translations (menu_item_id, locale, name) VALUES
            ('${MENU_ONE}', 'ko', '재고1'), ('${MENU_FIVE}', 'ko', '재고5'), ('${MENU_SOLD_OUT}', 'ko', '품절');
    `);
}

function cleanUp(): void {
    runPsql(`
        DELETE FROM public.orders WHERE idempotency_key::text LIKE '${KEY_PREFIX}%';
        DELETE FROM public.menu_items WHERE id IN ('${MENU_ONE}', '${MENU_FIVE}', '${MENU_SOLD_OUT}');
        DO $$ BEGIN
            IF to_regclass('public.t07_counter_backup') IS NOT NULL THEN
                IF EXISTS (SELECT 1 FROM public.t07_counter_backup) THEN
                    UPDATE public.counters SET value = (SELECT value FROM public.t07_counter_backup)
                    WHERE key = 'pickup_number';
                ELSE
                    DELETE FROM public.counters WHERE key = 'pickup_number';
                END IF;
                DROP TABLE public.t07_counter_backup;
            END IF;
        END $$;
    `);
}

function scalar(sql: string): string {
    return runPsql(sql).trim();
}

test("create_order 계약(가격 재계산·스냅샷·재고·멱등·픽업 번호·토큰·에러 코드·권한)", () => {
    const output = execFileSync("docker", psqlArgs().filter((arg) => !["-q", "-t", "-A"].includes(arg)), {
        input: readFileSync("tests/integration/t07-create-order.sql", "utf8"),
        encoding: "utf8", timeout: 60_000, stdio: ["pipe", "pipe", "pipe"],
    });
    expect(output).toContain("ROLLBACK");
}, 70_000);

test("재고 1개에 동시 주문 2건 → 1건만 성공하고 재고는 0에서 멈춘다", async () => {
    cleanUp();
    setUpMenus();
    try {
        const results = await Promise.allSettled([
            createOrderInSession(key(1), MENU_ONE, 1),
            createOrderInSession(key(2), MENU_ONE, 1),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(String(rejected[0].reason?.stderr ?? rejected[0].reason)).toContain("OUT_OF_STOCK");
        expect(scalar(`SELECT stock FROM public.menu_items WHERE id = '${MENU_ONE}'`)).toBe("0");
        expect(scalar(`SELECT count(*) FROM public.orders WHERE idempotency_key::text LIKE '${KEY_PREFIX}%'`)).toBe("1");
    } finally {
        cleanUp();
    }
}, 70_000);

test("같은 멱등키 동시 2회 → 주문 1건, 재고 1회 차감, 같은 픽업 번호", async () => {
    cleanUp();
    setUpMenus();
    try {
        const [a, b] = await Promise.all([
            createOrderInSession(key(3), MENU_FIVE, 1),
            createOrderInSession(key(3), MENU_FIVE, 1),
        ]);
        const first = JSON.parse(a) as { orderId: string; pickupNumber: number; created: boolean };
        const second = JSON.parse(b) as { orderId: string; pickupNumber: number; created: boolean };
        expect(first.orderId).toBe(second.orderId);
        expect(first.pickupNumber).toBe(second.pickupNumber);
        expect([first.created, second.created].sort()).toEqual([false, true]);
        expect(scalar(`SELECT stock FROM public.menu_items WHERE id = '${MENU_FIVE}'`)).toBe("4");
    } finally {
        cleanUp();
    }
}, 70_000);

test("동시 생성 5건 → 픽업 번호가 중복·빈 번호 없이 연속", async () => {
    cleanUp();
    setUpMenus();
    try {
        const before = Number(scalar("SELECT coalesce((SELECT value FROM public.counters WHERE key = 'pickup_number'), 0)"));
        runPsql(`UPDATE public.menu_items SET stock = 10 WHERE id = '${MENU_FIVE}'`);
        const results = await Promise.all([10, 11, 12, 13, 14].map((n) => createOrderInSession(key(n), MENU_FIVE, 1)));
        const numbers = results.map((r) => (JSON.parse(r) as { pickupNumber: number }).pickupNumber).sort((x, y) => x - y);
        expect(numbers).toEqual([1, 2, 3, 4, 5].map((n) => before + n));
    } finally {
        cleanUp();
    }
}, 70_000);

test("한 줄이라도 실패하면 커밋된 상태에 주문·재고·픽업 번호 변화가 없다", () => {
    cleanUp();
    setUpMenus();
    try {
        const before = scalar("SELECT coalesce((SELECT value FROM public.counters WHERE key = 'pickup_number'), 0)");
        expect(() => runPsql(`
            SET ROLE service_role;
            SELECT public.create_order('${key(20)}', 'cash', 'ko',
                '[{"menuItemId":"${MENU_FIVE}","quantity":2,"optionIds":[]},
                  {"menuItemId":"${MENU_SOLD_OUT}","quantity":1,"optionIds":[]}]');
        `)).toThrow(/MENU_UNAVAILABLE/);
        expect(scalar(`SELECT stock FROM public.menu_items WHERE id = '${MENU_FIVE}'`)).toBe("5");
        expect(scalar("SELECT coalesce((SELECT value FROM public.counters WHERE key = 'pickup_number'), 0)")).toBe(before);
        expect(scalar(`SELECT count(*) FROM public.orders WHERE idempotency_key = '${key(20)}'`)).toBe("0");
    } finally {
        cleanUp();
    }
}, 70_000);
