"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BACK_LINK_CLASS, PageHeader } from "@/components/customer/PageHeader";
import { ChevronLeftIcon, ExternalLinkIcon, ImageIcon } from "@/components/ui/icons";
import { FESTIVAL_CREDITS } from "@/features/festival/festivalArt";
import { useT } from "@/lib/i18n/locale";

// 축제 이펙트 그림(public/festival) 출처 — Flaticon 무료 라이선스의 출처 표기 의무를 지킨다. 화면 언어로 보인다.
// 그림은 크림색 타일 위에 올려 검은 실루엣도 보이게 하고, 타일이 차례로 떠오른다.
export function CreditsList() {
    const t = useT();
    return (
        <>
            <PageHeader
                title={t("footer.credits")}
                back={
                    <Link href="/" aria-label={t("nav.backToMenu")} className={BACK_LINK_CLASS}>
                        <ChevronLeftIcon />
                    </Link>
                }
            />
            <div className="flex flex-col gap-4 px-4 pt-5">
                <section className="iron-card glow-border relative overflow-hidden rounded-3xl p-5">
                    <span aria-hidden="true" className="syrup-btn mb-3 flex size-12 items-center justify-center rounded-2xl">
                        <ImageIcon className="size-6" />
                    </span>
                    <h2 className="font-display text-2xl leading-tight text-dough">{t("credits.heroTitle")}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-dough-dim">
                        {t("credits.introBefore")}
                        <a
                            href="https://www.flaticon.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-syrup underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-syrup"
                        >
                            Flaticon
                        </a>
                        {t("credits.introAfter")}
                    </p>
                    <p className="fest-hint font-num mt-3">{t("credits.count", { count: FESTIVAL_CREDITS.length })}</p>
                </section>

                <ul className="grid grid-cols-2 gap-3">
                    {FESTIVAL_CREDITS.map((credit, index) => (
                        <motion.li
                            key={credit.file}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-20px" }}
                            transition={{ type: "spring", stiffness: 300, damping: 26, delay: (index % 2) * 0.05 }}
                            className="iron-card flex flex-col overflow-hidden rounded-2xl"
                        >
                            <span aria-hidden="true" className="flex h-24 items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#fff6e6,#f2dcbc)] p-3">
                                {/* eslint-disable-next-line @next/next/no-img-element -- 작은 정적 그림 */}
                                <img src={`/festival/${credit.file}.webp`} alt="" loading="lazy" className="max-h-full max-w-full object-contain drop-shadow-[0_4px_8px_rgba(80,40,10,0.25)]" />
                            </span>
                            <span className="flex flex-1 flex-col gap-1 p-3">
                                <span className="font-display truncate text-[15px] leading-tight text-dough">{credit.title}</span>
                                <span className="truncate text-[11px] text-dough-dim">
                                    {credit.author ? `Icon by ${credit.author}` : t("credits.authorUnknown")}
                                </span>
                                <a
                                    href={credit.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t("credits.sourceLabel", { title: credit.title })}
                                    className="fest-hint mt-auto self-start focus-visible:outline-2 focus-visible:outline-syrup"
                                >
                                    {t("credits.source")}
                                    <ExternalLinkIcon className="size-3" strokeWidth={2.75} />
                                </a>
                            </span>
                        </motion.li>
                    ))}
                </ul>
            </div>
        </>
    );
}
