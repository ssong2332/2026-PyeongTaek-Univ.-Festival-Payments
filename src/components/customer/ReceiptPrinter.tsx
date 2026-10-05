"use client";

import { motion, type Variants } from "motion/react";
import type { PaymentMethod } from "@/domain/order/status";
import type { OrderStatusItemDto } from "@/lib/dto/order";
import { formatWon } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "./orderDisplay";

// 연출 시간표(초): 프린터 등장 → 종이가 끊어 끊어 출력 → 줄마다 인쇄 → 도장 쾅.
const PRINT_START = 0.35;
const PRINT_DURATION = 1.6;
const STAMP_AT = PRINT_START + PRINT_DURATION + 0.25;

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const LINES: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: PRINT_START + 0.2 } },
};
const LINE: Variants = {
  hidden: { opacity: 0, filter: "blur(2px)" },
  show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.18 } },
};

// 주문 완료 보기의 영수증. 프린터 슬롯에서 종이가 내려오고, 다 나오면 "접수 완료" 도장이 찍힌다(도장·프린터는 장식).
export function ReceiptPrinter({
  totalAmount,
  paymentMethod,
  items,
  createdAt,
}: {
  totalAmount: number;
  paymentMethod: PaymentMethod;
  items: readonly OrderStatusItemDto[];
  createdAt?: string;
}) {
  return (
    <div className="relative">
      {/* 프린터 몸체(장식) */}
      <motion.div
        aria-hidden="true"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1, x: [0, -1.5, 1.5, -1, 1, 0] }}
        transition={{ y: { type: "spring", stiffness: 300, damping: 22 }, opacity: { duration: 0.2 }, x: { duration: 0.25, repeat: 6, delay: PRINT_START } }}
        className="relative z-10 mx-1 flex h-14 items-center justify-between rounded-[22px] bg-linear-to-b from-iron-3 to-iron border border-iron-line px-4 shadow-[0_14px_28px_rgba(42,20,12,0.35)]"
      >
        <span className="flex items-center gap-2">
          <motion.span
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 0.5, repeat: 5, delay: PRINT_START }}
            className="size-2.5 rounded-full bg-[#7dffb0] shadow-[0_0_10px_#7dffb0]"
          />
          <span className="text-[10px] font-bold tracking-[0.3em] text-white/60">HOTTEOK PRINT</span>
        </span>
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
        </span>
        {/* 종이가 나오는 슬롯 */}
        <span className="absolute inset-x-5 -bottom-1 h-2 rounded-full bg-black/70" />
      </motion.div>

      {/* 슬롯 아래로만 보이게 잘라 낸 종이 */}
      <div className="relative -mt-1 overflow-hidden px-4 pb-6">
        <motion.section
          aria-label="주문 영수증"
          initial={{ y: "-102%" }}
          animate={{ y: ["-102%", "-74%", "-72%", "-44%", "-42%", "-14%", "0%"] }}
          transition={{ duration: PRINT_DURATION, delay: PRINT_START, ease: "easeOut" }}
          className="relative"
        >
          {/* 도장 찍힐 때 종이가 쿵 눌린다 */}
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 0.965, 1.01, 1] }}
            transition={{ duration: 0.35, delay: STAMP_AT + 0.12 }}
            className="relative bg-[#fbf3e4] px-5 pt-5 pb-8 font-mono text-[#3b2a1e] shadow-[0_18px_36px_rgba(91,55,39,0.14)] [clip-path:polygon(0_0,100%_0,100%_calc(100%-10px),95%_100%,90%_calc(100%-10px),85%_100%,80%_calc(100%-10px),75%_100%,70%_calc(100%-10px),65%_100%,60%_calc(100%-10px),55%_100%,50%_calc(100%-10px),45%_100%,40%_calc(100%-10px),35%_100%,30%_calc(100%-10px),25%_100%,20%_calc(100%-10px),15%_100%,10%_calc(100%-10px),5%_100%,0_calc(100%-10px))]"
          >
            <motion.div variants={LINES} initial="hidden" animate="show" className="flex flex-col gap-3">
              <motion.div variants={LINE} className="text-center">
                <p className="font-display text-xl text-molasses">호떡 부스 영수증</p>
                <p className="text-[11px] text-neutral-500">2026 평택대학교 대동제{createdAt ? ` · ${KST.format(new Date(createdAt))}` : ""}</p>
              </motion.div>
              <motion.p variants={LINE} aria-hidden="true" className="overflow-hidden text-xs whitespace-nowrap text-neutral-300">
                {"- ".repeat(40)}
              </motion.p>
              {items.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {items.map((item, index) => (
                    // 주문 시점 스냅샷이라 순서가 바뀌지 않는다.
                    <motion.li key={index} variants={LINE} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        {item.name} <span className="text-neutral-500">×{item.quantity}</span>
                        {item.options.length > 0 && <span className="block text-[11px] text-neutral-500">+ {item.options.join(", ")}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatWon(item.lineTotal)}</span>
                    </motion.li>
                  ))}
                </ul>
              )}
              <motion.div variants={LINE} className="flex items-end justify-between border-t-2 border-neutral-800 pt-2">
                <span className="text-sm font-bold">합계</span>
                <span className="font-display text-3xl text-molasses">{formatWon(totalAmount)}</span>
              </motion.div>
              <motion.dl variants={LINE} className="flex items-center justify-between text-sm">
                <dt className="text-neutral-500">결제 방법</dt>
                <dd className="font-bold text-neutral-900">{PAYMENT_METHOD_LABELS[paymentMethod]}</dd>
              </motion.dl>
              <motion.p variants={LINE} aria-hidden="true" className="pt-1 text-center text-[10px] tracking-[0.4em] text-neutral-400">
                ||| | || ||| | ||| || | |||
              </motion.p>
            </motion.div>

            <Stamp />
          </motion.div>
        </motion.section>
      </div>
    </div>
  );
}

// "접수 완료" 도장(장식). 위에서 크게 떨어져 비스듬히 찍히고, 잉크가 번지듯 퍼진다.
function Stamp() {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ scale: 3.2, opacity: 0, rotate: -40, y: -80 }}
      animate={{ scale: 1, opacity: 1, rotate: -14, y: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 20, delay: STAMP_AT }}
      className="pointer-events-none absolute top-28 -right-1 mix-blend-multiply"
    >
      <motion.span
        initial={{ scale: 0.4, opacity: 0.5 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 0.7, delay: STAMP_AT + 0.12 }}
        className="absolute inset-0 rounded-full bg-[#d6342c]/40"
      />
      <svg viewBox="0 0 120 120" className="size-28">
        <defs>
          {/* 잉크가 덜 묻은 듯한 거친 질감 */}
          <filter id="stamp-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.5" result="mask" />
            <feComposite in="SourceGraphic" in2="mask" operator="in" />
          </filter>
        </defs>
        <g filter="url(#stamp-rough)" fill="none" stroke="#d6342c">
          <circle cx="60" cy="60" r="54" strokeWidth="6" />
          <circle cx="60" cy="60" r="44" strokeWidth="2.5" />
          <text x="60" y="56" textAnchor="middle" fill="#d6342c" stroke="none" fontSize="21" fontWeight="900" fontFamily="sans-serif">
            접수완료
          </text>
          <text x="60" y="77" textAnchor="middle" fill="#d6342c" stroke="none" fontSize="10" fontWeight="800" letterSpacing="2" fontFamily="sans-serif">
            · HOTTEOK ·
          </text>
        </g>
      </svg>
    </motion.div>
  );
}
