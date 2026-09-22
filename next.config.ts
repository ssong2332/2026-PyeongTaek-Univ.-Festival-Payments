import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // `next dev`가 AGENTS.md(사용자 소유 규칙 원본)에 안내 블록을 자동 삽입하는 기능 — docs/ToolPacks.md "Next.js 16+ 알려진 함정"
    agentRules: false,
};

export default nextConfig;
