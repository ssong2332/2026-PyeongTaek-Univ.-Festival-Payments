import type { Metadata } from "next";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
// Pretendard(OFL-1.1) 동적 서브셋 — 화면에 나온 글자가 든 조각(woff2)만 받는다. 같은 도메인에서 서빙(외부 요청 없음).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
    title: "2026 평택대 축제",
    description: "평택대학교 축제 부스 주문 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang={DEFAULT_LOCALE}>
            <body>{children}</body>
        </html>
    );
}
