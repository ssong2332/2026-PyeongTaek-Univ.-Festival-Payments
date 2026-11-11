"use client";

import { motion } from "motion/react";
import { useT } from "@/lib/i18n/locale";

// 부스에서 부르는 번호 그대로 보이게 3자리로 0을 채우고(5 → 005), 천 단위 쉼표는 넣지 않는다.
export function formatPickupNumber(pickupNumber: number): string {
  return String(pickupNumber).padStart(3, "0");
}

// 숫자 한 자리씩 아래에서 뒤집히며 튀어 오른다(슬롯머신처럼).
// 화면 읽기 프로그램에는 번호 전체(sr-only)를 한 번에 읽히고, 움직이는 낱자는 숨긴다.
function Digits({ digits, delay = 0 }: { digits: string; delay?: number }) {
  return (
    <>
      <span className="sr-only">{digits}</span>
      {digits.split("").map((digit, index) => (
        <motion.span
          key={`${index}-${digit}`}
          initial={{ y: "70%", opacity: 0, rotateX: -90 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 18, delay: delay + index * 0.12 }}
          aria-hidden="true"
          className="inline-block"
        >
          {digit}
        </motion.span>
      ))}
    </>
  );
}

// header: 주문 현황 머리의 시럽빛 큰 숫자. tile: (예비) 단독 타일 — 주문 완료 보기는 BrandedPickup이 번호를 새긴다.
export function PickupNumberDisplay({
  pickupNumber,
  variant = "tile",
}: {
  pickupNumber: number;
  variant?: "tile" | "header";
}) {
  const t = useT();
  const digits = formatPickupNumber(pickupNumber);
  return (
    <section aria-label={t("pickup.label")} className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-dough-dim">{t("pickup.label")}</p>
      <p className={`font-num leading-none text-syrup drop-shadow-[0_0_18px_rgba(255,181,71,0.35)] [perspective:400px] ${variant === "header" ? "text-7xl" : "text-6xl"}`}>
        <Digits digits={digits} delay={0.1} />
      </p>
    </section>
  );
}
