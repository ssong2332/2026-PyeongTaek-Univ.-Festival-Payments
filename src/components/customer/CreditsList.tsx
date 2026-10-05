"use client";

import { FESTIVAL_CREDITS } from "@/features/festival/festivalArt";
import { useT } from "@/lib/i18n/locale";

// 축제 이펙트 그림(public/festival) 출처 — Flaticon 무료 라이선스의 출처 표기 의무를 지킨다. 화면 언어로 보인다.
export function CreditsList() {
    const t = useT();
    return (
        <div className="mx-auto flex max-w-md flex-col gap-4">
            <h1 className="text-2xl font-bold text-dough">{t("footer.credits")}</h1>
            <p className="text-sm text-dough-dim">
                {t("credits.introBefore")}
                <a href="https://www.flaticon.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-syrup underline underline-offset-2">
                    Flaticon
                </a>
                {t("credits.introAfter")}
            </p>
            <ul className="iron-card iron-solid flex flex-col divide-y divide-iron-line rounded-2xl px-4">
                {FESTIVAL_CREDITS.map((credit) => (
                    <li key={credit.file} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0">
                            <span className="block truncate text-dough">{credit.title}</span>
                            <span className="block truncate text-xs text-dough-dim">
                                {credit.author ? `Icon by ${credit.author}` : t("credits.authorUnknown")} · flaticon.com
                            </span>
                        </span>
                        <a
                            href={credit.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-semibold text-syrup underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-syrup"
                        >
                            {t("credits.source")}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
