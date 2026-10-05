import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// T-24: E2E는 로컬 Supabase(`supabase start`)에서만 실행한다(ADR-0007).
// `npm run dev`는 .env.local(운영 DB)을 읽으므로, 개발 서버에 로컬 값을 덮어쓰고 주소가 로컬이 아니면 시작 전에 멈춘다.
const LOCAL_HOSTS = ["127.0.0.1", "localhost"];
const ENV_FILE = ".env.test.local";

export type E2eSupabase = {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    // Playwright webServer에 넘기는 값. process.env가 .env.local보다 먼저 읽힌다(Next 환경변수 우선순위).
    serverEnv: {
        NEXT_PUBLIC_SUPABASE_URL: string;
        NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
        SUPABASE_SERVICE_ROLE_KEY: string;
    };
};

export function assertLocalSupabaseUrl(value: string | undefined): string {
    let hostname = "";
    try {
        hostname = new URL(value ?? "").hostname;
    } catch {
        // 아래에서 같은 안내로 멈춘다.
    }
    if (!LOCAL_HOSTS.includes(hostname)) {
        throw new Error(
            "E2E는 로컬 Supabase에서만 실행할 수 있습니다. NEXT_PUBLIC_SUPABASE_URL이 127.0.0.1 또는 localhost가 아니어서 중단합니다.",
        );
    }
    return (value as string).replace(/\/$/, "");
}

function readEnvFile(): Record<string, string | undefined> {
    return existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
}

function required(file: Record<string, string | undefined>, key: string): string {
    const value = file[key]?.trim();
    if (!value) {
        throw new Error(`E2E 실행에는 ${ENV_FILE}의 ${key}가 필요합니다. .env.test.example을 참고하세요.`);
    }
    return value;
}

export function resolveE2eSupabase(
    env: Record<string, string | undefined> = process.env,
    file: Record<string, string | undefined> = readEnvFile(),
): E2eSupabase {
    // 셸에 다른 주소가 잡혀 있으면 그 값이 개발 서버로 새지 않게 여기서 멈춘다.
    if (env.NEXT_PUBLIC_SUPABASE_URL) assertLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);

    const url = assertLocalSupabaseUrl(required(file, "SUPABASE_URL"));
    const anonKey = required(file, "SUPABASE_ANON_KEY");
    const serviceRoleKey = required(file, "SUPABASE_SERVICE_ROLE_KEY");
    return {
        url,
        anonKey,
        serviceRoleKey,
        serverEnv: {
            NEXT_PUBLIC_SUPABASE_URL: url,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
            SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        },
    };
}
