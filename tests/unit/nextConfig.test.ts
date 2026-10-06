import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const TOKEN = "0123456789abcdef".repeat(4);

async function headerRules() {
    return (await nextConfig.headers?.()) ?? [];
}

// 경로 매칭은 Next가 routes-manifest.json에 쓰는 정규식으로 한다 — OpenNext Worker도 이 정규식으로 응답 헤더를 고른다.
// 같은 키는 나중 규칙이 이기고, has·missing 조건이 붙은 규칙은 요청에 따라 빠지므로 항상 붙는 값에서 제외한다.
async function referrerPolicyFor(pathname: string) {
    let value: string | undefined;
    for (const rule of await headerRules()) {
        if (rule.has || rule.missing) continue;
        if (!new RegExp(buildCustomRoute("header", rule).regex).test(pathname)) continue;
        for (const header of rule.headers) {
            if (header.key.toLowerCase() === "referrer-policy") value = header.value;
        }
    }
    return value;
}

describe("next.config headers (Referrer-Policy — 주문 현황 URL의 상태 토큰 유출 방지)", () => {
    it("주문 현황 페이지 /orders/{token}에 no-referrer를 붙인다", async () => {
        expect(await referrerPolicyFor(`/orders/${TOKEN}`)).toBe("no-referrer");
    });

    it("루트 /에도 붙인다 (경로 0단계)", async () => {
        expect(await referrerPolicyFor("/")).toBe("no-referrer");
    });

    it.each([`/api/orders/${TOKEN}`, "/api/admin/orders/1/transition"])(
        "API %s에도 붙인다 (여러 단계 경로)",
        async (pathname) => {
            expect(await referrerPolicyFor(pathname)).toBe("no-referrer");
        },
    );

    it("없는 경로(404 응답)에도 붙인다", async () => {
        expect(await referrerPolicyFor("/no-such-page")).toBe("no-referrer");
    });

    it("어떤 규칙도 Referrer-Policy를 no-referrer 외의 값으로 설정하지 않는다 (조건부 규칙 포함)", async () => {
        const values = (await headerRules())
            .flatMap((rule) => rule.headers)
            .filter((header) => header.key.toLowerCase() === "referrer-policy")
            .map((header) => header.value);

        expect(values.length).toBeGreaterThan(0);
        expect(new Set(values)).toEqual(new Set(["no-referrer"]));
    });
});
