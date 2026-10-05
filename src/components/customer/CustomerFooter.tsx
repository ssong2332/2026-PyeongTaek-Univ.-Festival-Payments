"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/locale";

const LINK_CLASS = "underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-syrup";

// 고객 화면 공통 꼬리 — 개인정보 안내·이미지 출처 링크(화면 언어로).
export function CustomerFooter() {
    const t = useT();
    return (
        <footer className="px-4 pt-10 pb-32 text-center text-xs text-dough-dim">
            <Link href="/privacy" className={LINK_CLASS}>
                {t("footer.privacy")}
            </Link>
            <span aria-hidden="true" className="mx-2">
                ·
            </span>
            <Link href="/credits" className={LINK_CLASS}>
                {t("footer.credits")}
            </Link>
        </footer>
    );
}
