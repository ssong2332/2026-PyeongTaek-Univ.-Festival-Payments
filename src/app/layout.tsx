import type { Metadata } from "next";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
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
