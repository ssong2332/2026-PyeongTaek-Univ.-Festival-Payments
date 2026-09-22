import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// domain·services는 프레임워크 무관 계층 — next/supabase 유입 금지 (Architecture "계층 규칙")
const frameworkImports = [
    { group: ["next", "next/*"], message: "domain/services는 next를 import하지 않는다 (Architecture 계층 규칙)." },
    { group: ["@supabase/*"], message: "domain/services는 @supabase를 import하지 않는다 (Architecture 계층 규칙)." },
];

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        // 테스트·도구 산출물
        "node_modules/**",
        "playwright-report/**",
        "test-results/**",
        "coverage/**",
        // AGENTS.md 금지 조항 — 가드 훅·규칙 문서는 린터 대상에서 제외한다 (자동 재서식이 훅·문서를 깨뜨림)
        ".claude/**",
        ".codex/**",
        ".agents/**",
        "docs/**",
        "AGENTS.md",
        "CLAUDE.md",
        // 사용자 소유 강제 스크립트(CommonJS) — AGENTS.md 문서 소유권 표, 같은 사유로 제외
        "scripts/**",
    ]),
    {
        rules: {
            "import/no-cycle": "error",
        },
    },
    {
        files: ["src/domain/**/*.{ts,tsx}", "src/services/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": ["error", { patterns: frameworkImports }],
        },
    },
    {
        // 브라우저에서 실행되는 계층은 service_role 클라이언트를 import할 수 없다 (Architecture "보안 체크" 시크릿 행)
        files: ["src/components/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@/infra/supabase/server", "**/infra/supabase/server"],
                            message: "service_role 클라이언트는 Route Handler·서버 컴포넌트 전용 — 클라이언트 계층에서 import 금지.",
                        },
                    ],
                },
            ],
        },
    },
]);

export default eslintConfig;
