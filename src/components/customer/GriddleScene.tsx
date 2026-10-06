"use client";

import { AnimatePresence, motion } from "motion/react";
import type { OrderStatus } from "@/domain/order/status";
import { useT } from "@/lib/i18n/locale";

type Stage = "dough" | "filling" | "cooking" | "done" | "cold";

const STAGE: Record<OrderStatus, Stage> = {
  pending: "dough",
  paid: "filling",
  cooking: "cooking",
  completed: "done",
  cancelled: "cold",
  refunded: "cold",
  expired: "cold",
};

// 단계 설명은 사전 griddle.{단계}

// 호떡 하나의 모양·색이 단계마다 이어서 바뀐다(장면을 갈아 끼우지 않는다): 반죽 공 → 호떡소 → 눌러 굽기 → 노릇.
const DOUGH_SHAPE: Record<Stage, { scaleX: number; scaleY: number; background: string; boxShadow: string }> = {
  dough: {
    scaleX: 0.62,
    scaleY: 0.62,
    background: "radial-gradient(circle at 38% 32%, #fffaf0 0%, #f7e8d0 45%, #e2cba6 100%)",
    boxShadow: "0 18px 30px rgba(0,0,0,0.45)",
  },
  filling: {
    scaleX: 0.8,
    scaleY: 0.72,
    background: "radial-gradient(circle at 40% 34%, #fff6e2 0%, #f1dcb6 50%, #d8b98a 100%)",
    boxShadow: "0 14px 26px rgba(0,0,0,0.45)",
  },
  cooking: {
    scaleX: 1,
    scaleY: 0.92,
    background: "radial-gradient(circle at 40% 35%, #f7d9a0 0%, #e2a85a 55%, #b9692a 100%)",
    boxShadow: "0 8px 18px rgba(0,0,0,0.5), 0 0 30px rgba(255,150,50,0.35)",
  },
  done: {
    scaleX: 1,
    scaleY: 0.94,
    background: "radial-gradient(circle at 38% 32%, #ffe0a0 0%, #e09a45 50%, #a9581f 100%)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.5), 0 0 50px rgba(255,181,71,0.55)",
  },
  cold: {
    scaleX: 0.95,
    scaleY: 0.9,
    background: "radial-gradient(circle at 40% 35%, #b9ad9f 0%, #8d8173 60%, #5f574d 100%)",
    boxShadow: "0 8px 16px rgba(0,0,0,0.5)",
  },
};

// 주문 현황의 철판 장면(장식 — 같은 내용은 아래 진행 단계가 글로 알려 준다).
export function GriddleScene({ status }: { status: OrderStatus }) {
  const t = useT();
  const stage = STAGE[status];
  const hot = stage !== "cold";
  const shape = DOUGH_SHAPE[stage];

  return (
    <section aria-hidden="true" className="flex flex-col items-center">
      <div className="relative size-64">
        {/* 철판: 달궈졌을 때는 가장자리가 숯불빛, 식으면 회색 */}
        <motion.span
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: hot
              ? "0 0 0 2px rgba(185,88,28,0.5), 0 0 60px rgba(240,120,40,0.35), inset 0 10px 30px rgba(0,0,0,0.7)"
              : "0 0 0 2px rgba(90,80,90,0.5), 0 0 0 rgba(0,0,0,0), inset 0 10px 30px rgba(0,0,0,0.7)",
          }}
          transition={{ duration: 1.2 }}
          style={{ background: "radial-gradient(circle at 50% 40%, #3a3140 0%, #1d1922 65%, #121016 100%)" }}
        />
        <span className="absolute inset-5 rounded-full border border-white/5" />
        {hot && (
          <svg aria-hidden="true" className="absolute size-0">
            <filter id="griddle-haze">
              <feTurbulence type="fractalNoise" baseFrequency="0.02 0.08" numOctaves="2" seed="7" result="n">
                <animate attributeName="baseFrequency" dur="4s" values="0.02 0.08;0.03 0.12;0.02 0.08" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="n" scale="4" />
            </filter>
          </svg>
        )}

        {/* 기름 방울(굽는 중) */}
        <AnimatePresence>
          {stage === "cooking" &&
            Array.from({ length: 10 }, (_, index) => {
              const angle = (index / 10) * Math.PI * 2;
              return (
                <motion.span
                  key={index}
                  className="absolute size-1.5 rounded-full bg-[#ffd27a]"
                  style={{ left: `${50 + Math.cos(angle) * 36}%`, top: `${50 + Math.sin(angle) * 36}%` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.4, 1.3, 0.2], y: [0, -6] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.13 }}
                />
              );
            })}
        </AnimatePresence>

        {/* 호떡 — 단계가 바뀌면 같은 덩어리가 모양·색을 바꾸며 이어진다. 굽는 중에는 눌렸다가 뒤집힌다. */}
        <div
          className={`absolute inset-0 flex items-center justify-center [perspective:600px] ${hot ? "motion-safe:[filter:url(#griddle-haze)]" : ""}`}
        >
          <motion.span
            className="relative block size-40 rounded-full"
            initial={false}
            animate={
              stage === "cooking"
                ? {
                    scaleX: [1, 1.12, 1.12, 1, 1],
                    scaleY: [0.92, 0.7, 0.7, 0.92, 0.92],
                    rotateX: [0, 0, 0, 0, 180],
                    background: shape.background,
                    boxShadow: shape.boxShadow,
                  }
                : stage === "dough"
                  ? { scaleX: [0.62, 0.66, 0.62], scaleY: [0.62, 0.58, 0.62], rotateX: 0, background: shape.background, boxShadow: shape.boxShadow }
                  : { scaleX: shape.scaleX, scaleY: shape.scaleY, rotateX: 0, background: shape.background, boxShadow: shape.boxShadow }
            }
            transition={
              stage === "cooking"
                ? { duration: 3.2, repeat: Infinity, times: [0, 0.2, 0.55, 0.7, 1], ease: "easeInOut", background: { duration: 1 }, boxShadow: { duration: 1 } }
                : stage === "dough"
                  ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", background: { duration: 1 }, boxShadow: { duration: 1 } }
                  : { type: "spring", stiffness: 160, damping: 16, background: { duration: 1 }, boxShadow: { duration: 1 } }
            }
          >
            {/* 굽기 자국·흑설탕 점 — 반죽일 때는 보이지 않고, 구울수록 진해진다 */}
            <motion.span
              className="absolute inset-0 rounded-full"
              initial={false}
              animate={{ opacity: stage === "dough" ? 0 : stage === "filling" ? 0.35 : stage === "cold" ? 0.3 : 0.85 }}
              transition={{ duration: 1 }}
              style={{
                background:
                  "radial-gradient(circle at 30% 40%, rgba(110,50,15,0.55) 0 4%, transparent 5%), radial-gradient(circle at 62% 30%, rgba(110,50,15,0.5) 0 3.5%, transparent 4.5%), radial-gradient(circle at 55% 64%, rgba(110,50,15,0.55) 0 4.5%, transparent 5.5%), radial-gradient(circle at 36% 70%, rgba(110,50,15,0.45) 0 3%, transparent 4%), radial-gradient(circle at 72% 55%, rgba(110,50,15,0.45) 0 3%, transparent 4%)",
              }}
            />
            {/* 윤기 */}
            <span className="absolute top-[14%] left-[22%] h-[18%] w-[34%] rounded-full bg-white/35 blur-[6px]" />
          </motion.span>
        </div>

        {/* 호떡소를 뿌리는 알갱이(호떡소 단계) */}
        <AnimatePresence>
          {stage === "filling" &&
            Array.from({ length: 9 }, (_, index) => (
              <motion.span
                key={index}
                className="absolute top-6 size-2 rounded-full bg-[#7a3b12]"
                style={{ left: `${40 + ((index * 7) % 22)}%` }}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: [-10, 90], opacity: [0, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.15, ease: "easeIn" }}
              />
            ))}
        </AnimatePresence>

        {/* 누르개(굽는 중): 내려와 꾹 누르고 올라간다 */}
        <AnimatePresence>
          {stage === "cooking" && (
            <motion.span
              className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center"
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: [-30, 38, 38, -30, -30], opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.2, 0.55, 0.7, 1], ease: "easeInOut" }}
            >
              <span className="h-7 w-4 rounded-t-md bg-[#6b3a22]" />
              <span className="h-3 w-28 rounded-md bg-linear-to-b from-[#c8cfd3] to-[#7f878c] shadow-[0_6px_10px_rgba(0,0,0,0.5)]" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* 완성되는 순간: 황금빛 고리가 퍼지고 설탕 반짝이가 터진다 */}
        <AnimatePresence>
          {stage === "done" && (
            <motion.span key="done-burst" className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.span
                className="absolute inset-8 rounded-full border-2 border-syrup"
                initial={{ scale: 0.6, opacity: 1 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
              {Array.from({ length: 14 }, (_, index) => {
                const angle = (index / 14) * Math.PI * 2;
                return (
                  <motion.span
                    key={index}
                    className="absolute top-1/2 left-1/2 size-2 rounded-full bg-[#fff3c9] shadow-[0_0_10px_#ffb547]"
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{ x: Math.cos(angle) * 140, y: Math.sin(angle) * 140, opacity: [0, 1, 0], scale: [1, 1, 0.3] }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                  />
                );
              })}
            </motion.span>
          )}
        </AnimatePresence>

        {/* 식는 철판: 마지막 연기가 천천히 흩어진다 */}
        <AnimatePresence>
          {stage === "cold" && (
            <motion.span key="cold-smoke" className="pointer-events-none absolute inset-x-0 top-10 flex justify-center gap-8" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  className="h-20 w-4 rounded-full bg-[#8a8290]/50 blur-[8px]"
                  initial={{ y: 30, opacity: 0, scaleX: 1 }}
                  animate={{ y: -60, opacity: [0, 0.7, 0], scaleX: 2.2 }}
                  transition={{ duration: 2.6, delay: index * 0.35, ease: "easeOut" }}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>

        {/* 김(굽는 중·완성) */}
        <AnimatePresence>
          {(stage === "cooking" || stage === "done") && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-6 flex justify-center gap-5">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-14 w-3 rounded-full bg-white/40 blur-[5px] motion-safe:animate-steam"
                  style={{ animationDelay: `${index * -1.1}s` }}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={stage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className={`mt-3 text-[15px] font-bold ${hot ? "text-dough" : "text-dough-dim"}`}
        >
          {t(`griddle.${stage}` as const)}
        </motion.p>
      </AnimatePresence>
    </section>
  );
}
