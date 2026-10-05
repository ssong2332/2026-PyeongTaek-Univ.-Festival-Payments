"use client";

import { useT } from "@/lib/i18n/locale";

// PRD F-12 1차·N-15. 전화번호 수집(2차 F-39) 착수 시 수집 항목·이용 목적을 이 고지에 더한다. 문구는 사전 privacy.*.
export default function PrivacyPage() {
  const t = useT();
  return (
    <main className="min-h-screen bg-iron px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-bold text-dough">{t("privacy.title")}</h1>

        <section aria-labelledby="privacy-collected" className="rounded-2xl border border-iron-line bg-iron-2 p-5">
          <h2 id="privacy-collected" className="text-xs font-semibold tracking-[0.2em] text-dough">
            {t("privacy.collected.title")}
          </h2>
          <p className="mt-2 text-lg font-bold text-dough">{t("privacy.collected.value")}</p>
          <p className="mt-1 text-sm text-dough-dim">
            {t("privacy.collected.body")}
          </p>
          {/* #89·DECISIONS #54: 메뉴판 "내 주문 현황 보기"용 기기 보관(features/customer/myOrders.ts). 보관 기간을 바꾸면 이 문구도 바꾼다. */}
          <p className="mt-1 text-sm text-dough-dim">
            {t("privacy.device")}
          </p>
        </section>

        <section aria-labelledby="privacy-disposal" className="rounded-2xl border border-iron-line bg-iron-2 p-5">
          <h2 id="privacy-disposal" className="text-xs font-semibold tracking-[0.2em] text-dough">
            {t("privacy.disposal.title")}
          </h2>
          <p className="mt-2 text-lg font-bold text-dough">2026-11-08</p>
          <p className="mt-1 text-sm text-dough-dim">
            {t("privacy.disposal.body")}
          </p>
        </section>
      </div>
    </main>
  );
}
