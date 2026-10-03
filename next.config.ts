import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // 주문 현황 URL(/orders/{token})의 상태 토큰이 Referer로 새지 않게 모든 경로(페이지·API)에 붙인다 — Architecture 보안 체크
    headers() {
        return [
            {
                source: "/:path*",
                headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
            },
        ];
    },
};

export default nextConfig;
