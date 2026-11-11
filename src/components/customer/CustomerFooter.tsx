"use client";

import Link from "next/link";
import { ImageIcon, ShieldIcon } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/locale";

const LINK_CLASS =
    "fest-glass inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-dough-dim transition-colors hover:text-syrup focus-visible:outline-2 focus-visible:outline-syrup active:scale-95";

// 고객 화면 공통 꼬리 — 개인정보 안내·이미지 출처(화면 언어로). 유리 알약 두 개 + 축제 이름.
export function CustomerFooter() {
    const t = useT();
    return (
        <footer className="flex flex-col items-center gap-3 px-4 pt-10 pb-32 text-center">
            <nav aria-label={t("footer.label")} className="flex flex-wrap justify-center gap-2">
                <Link href="/privacy" className={LINK_CLASS}>
                    <ShieldIcon className="size-3.5 text-syrup" />
                    {t("footer.privacy")}
                </Link>
                <Link href="/credits" className={LINK_CLASS}>
                    <ImageIcon className="size-3.5 text-syrup" />
                    {t("footer.credits")}
                </Link>
            </nav>
            <p className="font-num text-[10px] tracking-[0.25em] text-dough-dim/70 uppercase">{t("footer.signature")}</p>
        </footer>
    );
}
