import type { Metadata } from "next";

import { DEFAULT_LOCALE } from "@/domain/i18n/locales";

import "./globals.css";

export const metadata: Metadata = {
    title: "평택대 축제 부스 주문",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang={DEFAULT_LOCALE}>
            <body>{children}</body>
        </html>
    );
}
