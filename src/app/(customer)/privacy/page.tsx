"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BACK_LINK_CLASS, PageHeader } from "@/components/customer/PageHeader";
import { ChevronLeftIcon, PhoneIcon, ShieldIcon, TrashIcon } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/locale";
import type { MessageKey } from "@/lib/i18n/translate";

// PRD F-12 1차·N-15 개인정보 고지. 전화번호 수집(2차 F-39) 착수 시 수집 항목·이용 목적을 이 고지에 더한다. 문구는 사전 privacy.*.
// #89·DECISIONS #54: "기기 보관" 카드는 메뉴판 "내 주문 현황 보기"용(features/customer/myOrders.ts). 보관 기간을 바꾸면 이 문구도 바꾼다.
const FACTS: readonly { id: string; Icon: typeof ShieldIcon; title: MessageKey; value: MessageKey; body: MessageKey }[] = [
  { id: "collected", Icon: ShieldIcon, title: "privacy.collected.title", value: "privacy.collected.value", body: "privacy.collected.body" },
  { id: "device", Icon: PhoneIcon, title: "privacy.device.title", value: "privacy.device.value", body: "privacy.device" },
  { id: "disposal", Icon: TrashIcon, title: "privacy.disposal.title", value: "privacy.disposal.value", body: "privacy.disposal.body" },
];

export default function PrivacyPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        title={t("privacy.title")}
        back={
          <Link href="/" aria-label={t("nav.backToMenu")} className={BACK_LINK_CLASS}>
            <ChevronLeftIcon />
          </Link>
        }
      />
      <main className="flex flex-col gap-4 px-4 pt-5">
        <section className="iron-card glow-border relative overflow-hidden rounded-3xl p-5">
          <motion.span
            aria-hidden="true"
            initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className="syrup-btn mb-3 flex size-12 items-center justify-center rounded-2xl"
          >
            <ShieldIcon className="size-6" />
          </motion.span>
          <h2 className="font-display text-2xl leading-tight text-dough">{t("privacy.heroTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-dough-dim">{t("privacy.lead")}</p>
        </section>

        <div className="flex flex-col gap-3">
          {FACTS.map(({ id, Icon, title, value, body }, index) => (
            <motion.section
              key={id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.1 + index * 0.08 }}
              aria-labelledby={`privacy-${id}`}
              className="iron-card flex gap-4 rounded-3xl p-5"
            >
              <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-syrup/12 text-syrup">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 id={`privacy-${id}`} className="text-xs font-bold tracking-[0.15em] text-dough-dim">
                  {t(title)}
                </h2>
                <p className="font-display syrup-text mt-1 text-2xl leading-tight">{t(value)}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-dough-dim">{t(body)}</p>
              </div>
            </motion.section>
          ))}
        </div>
      </main>
    </>
  );
}
