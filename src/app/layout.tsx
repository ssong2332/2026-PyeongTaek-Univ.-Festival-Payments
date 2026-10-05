import type { Metadata } from "next";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
import { applyFestival, FESTIVAL_STOPS } from "@/features/festival/festivalTheme";
// Pretendard(OFL-1.1) 동적 서브셋 — 화면에 나온 글자가 든 조각(woff2)만 받는다. 같은 도메인에서 서빙(외부 요청 없음).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
// Black Han Sans(제목)·IBM Plex Mono(숫자) — OFL-1.1, 같은 도메인에서 서빙. unicode-range라 화면에 나온 글자 조각만 받는다.
import "@fontsource/black-han-sans/korean-400.css";
import "@fontsource/black-han-sans/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";

export const metadata: Metadata = {
    title: "2026 평택대 축제",
    description: "평택대학교 축제 부스 주문 서비스",
};

// 휴대폰 시각에 맞는 축제 색을 첫 화면이 그려지기 전에 <html>에 넣는다(Next 가이드: preventing-flash-before-hydration).
// 서버는 시각을 모르니 고객 화면은 이 스크립트가 칠한 색으로 바로 뜨고, 이후는 FestivalStage가 30초마다 맞춘다.
// 값은 고객 화면 틀(.festival-root) 안에서만 쓰여 관리자 화면에는 영향이 없다.
const FESTIVAL_BOOT = `try{(${applyFestival.toString()})(${JSON.stringify(FESTIVAL_STOPS)})}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        // 인라인 스크립트가 hydration 전에 <html>의 style·data-daylight를 바꾸므로 그 차이만 허용한다.
        <html lang={DEFAULT_LOCALE} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: FESTIVAL_BOOT }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
