import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "coverage/**"]),
    {
        files: ["src/**/*.{ts,tsx}"],
        settings: { "import/resolver": { typescript: { project: "./tsconfig.json" } } },
        rules: { "import/no-cycle": "error" },
    },
    {
        files: ["src/domain/**/*.{ts,tsx}", "src/services/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [{
                    group: ["next", "next/**", "supabase", "supabase/**", "@supabase/**"],
                    message: "domain과 services에서는 Next.js 및 Supabase를 직접 가져올 수 없습니다.",
                }],
            }],
        },
    },
    {
        files: ["src/components/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/app/(customer)/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-syntax": ["error", {
                selector: "Identifier[name='SUPABASE_SERVICE_ROLE_KEY']",
                message: "클라이언트 코드에서는 관리자 권한 키(SUPABASE_SERVICE_ROLE_KEY)를 참조할 수 없습니다.",
            }, {
                selector: "MemberExpression[computed=true][property.value='SUPABASE_SERVICE_ROLE_KEY']",
                message: "클라이언트 코드에서는 관리자 권한 키(SUPABASE_SERVICE_ROLE_KEY)를 참조할 수 없습니다.",
            }],
        },
    },
]);
