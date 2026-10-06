"use client";

import { motion } from "motion/react";
import { formatPickupNumber } from "./PickupNumberDisplay";
import { useT } from "@/lib/i18n/locale";

const STRIKE = 0.55; // 인두가 닿는 순간(초)

// 주문 완료: 노릇한 호떡 위에 픽업 번호를 인두로 찍듯 새긴다. 닿는 순간 호떡이 살짝 눌리고,
// 숫자는 달궈진 흰빛으로 빛나다가 천천히 갈색으로 식으며, 김이 한 번 피어오른다.
export function BrandedPickup({ pickupNumber }: { pickupNumber: number }) {
  const t = useT();
  const digits = formatPickupNumber(pickupNumber);
  return (
    <section aria-label={t("pickup.label")} className="flex flex-col items-center">
      <div className="relative size-60">
        {/* 호떡 */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 40%, rgba(110,50,15,0.5) 0 3%, transparent 4%), radial-gradient(circle at 68% 30%, rgba(110,50,15,0.45) 0 2.5%, transparent 3.5%), radial-gradient(circle at 72% 66%, rgba(110,50,15,0.5) 0 3%, transparent 4%), radial-gradient(circle at 26% 72%, rgba(110,50,15,0.4) 0 2.5%, transparent 3.5%), radial-gradient(circle at 38% 32%, #ffe0a0 0%, #e09a45 52%, #a9581f 100%)",
          }}
          initial={{ scale: 0.6, opacity: 0, rotate: -20 }}
          animate={{ scale: [0.6, 1.04, 1, 1, 0.95, 1.02, 1], opacity: 1, rotate: 0 }}
          transition={{ duration: 1.2, times: [0, 0.3, 0.42, STRIKE / 1.2, STRIKE / 1.2 + 0.06, STRIKE / 1.2 + 0.14, 1], ease: "easeOut" }}
        />
        <span aria-hidden="true" className="absolute top-[12%] left-[20%] h-[16%] w-[30%] rounded-full bg-white/30 blur-md" />
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          initial={{ boxShadow: "0 0 0 rgba(255,140,40,0)" }}
          animate={{ boxShadow: ["0 0 0 rgba(255,140,40,0)", "0 0 70px rgba(255,140,40,0.75)", "0 20px 50px rgba(0,0,0,0.55)"] }}
          transition={{ duration: 2.6, delay: STRIKE, times: [0, 0.15, 1] }}
        />
        {/* 번호: 달궈진 흰빛 → 갈색으로 식는다 */}
        <span className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="font-num text-[88px] leading-none tracking-tight"
            initial={{ opacity: 0, scale: 1.35, color: "#fff3c9", textShadow: "0 0 10px #ffc266, 0 0 30px #ff7a1a, 0 0 60px #ff5a00" }}
            animate={{ opacity: 1, scale: 1, color: "#4a200b", textShadow: "0 2px 0 rgba(255,220,160,0.35), 0 0 0 rgba(0,0,0,0)" }}
            transition={{
              opacity: { duration: 0.12, delay: STRIKE },
              scale: { type: "spring", stiffness: 600, damping: 18, delay: STRIKE },
              color: { duration: 2.4, delay: STRIKE + 0.5 },
              textShadow: { duration: 2.4, delay: STRIKE + 0.5 },
            }}
          >
            {digits}
          </motion.span>
        </span>
        {/* 달군 인두: 위에서 내려와 꾹 누르고 들려 올라간다 */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center"
          style={{ top: -150 }}
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: [-60, 0, 128, 128, -40], opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: 1.5, times: [0, 0.2, STRIKE / 1.5, (STRIKE + 0.32) / 1.5, 1], ease: "easeInOut" }}
        >
          <span className="h-24 w-4 rounded-t-lg bg-linear-to-b from-[#5a3a2a] to-[#2b1a12] shadow-[inset_2px_0_0_rgba(255,255,255,0.15)]" />
          <span className="h-3 w-7 rounded-sm bg-[#4a4f54]" />
          <motion.span
            className="h-6 w-36 rounded-md bg-linear-to-b from-[#9aa1a6] to-[#5d6368]"
            animate={{ boxShadow: ["0 0 0 rgba(255,90,0,0)", "0 6px 30px rgba(255,90,0,0.9)", "0 6px 30px rgba(255,90,0,0.9)", "0 0 0 rgba(255,90,0,0)"] }}
            transition={{ duration: 1.5, times: [0, 0.25, 0.55, 1] }}
            style={{ backgroundImage: "linear-gradient(180deg,#9aa1a6,#5d6368), linear-gradient(0deg,#ff7a1a,transparent)" }}
          />
        </motion.span>
        {/* 닿는 순간 튀는 불꽃 */}
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2">
          {Array.from({ length: 16 }, (_, index) => {
            const angle = (index / 16) * Math.PI * 2;
            const distance = 80 + (index % 4) * 18;
            return (
              <motion.span
                key={index}
                className="absolute size-1.5 rounded-full bg-[#fff3c9] shadow-[0_0_8px_#ff9a3d]"
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.6 + 20, opacity: [0, 1, 0], scale: [1, 1, 0.3] }}
                transition={{ duration: 0.7, delay: STRIKE + 0.02, ease: "easeOut" }}
              />
            );
          })}
        </span>
        {/* 인두 자국에서 피어오르는 김 */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 flex justify-center gap-6">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="h-16 w-3 rounded-full bg-white/50 blur-[6px]"
              initial={{ opacity: 0, y: 20, scaleX: 1 }}
              animate={{ opacity: [0, 0.8, 0], y: -40, scaleX: 1.8 }}
              transition={{ duration: 1.8, delay: STRIKE + 0.2 + index * 0.15, ease: "easeOut" }}
            />
          ))}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-syrup">{t("pickup.label")}</p>
      <p className="mt-1 text-sm text-dough-dim">{t("pickup.hint")}</p>
    </section>
  );
}
