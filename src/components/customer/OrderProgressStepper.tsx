"use client";

import { motion } from "motion/react";

// 취소·환불·만료는 이 단계에 없다 — 화면이 스테퍼 대신 상태 안내를 보여 준다.
export type ProgressStatus = "pending" | "paid" | "cooking" | "completed";

type StepState = "done" | "current" | "upcoming";

const STEPS: readonly { status: ProgressStatus; label: string }[] = [
  { status: "pending", label: "주문 접수됨" },
  { status: "paid", label: "결제 완료" },
  { status: "cooking", label: "호떡 굽는 중" },
  { status: "completed", label: "완성! 수령해주세요" },
];

const LABEL_CLASS: Record<StepState, string> = {
  done: "text-dough/80",
  current: "font-bold text-dough",
  upcoming: "text-dough-dim",
};

// 현금 주문은 pending → cooking으로 바로 넘어가므로, 현재 단계보다 앞은 거쳤는지와 관계없이 완료로 표시한다.
// 왼쪽 열선이 현재 단계까지 캐러멜→시럽빛으로 차오르고, 지난 단계의 원은 숫자가 체크로 그려지며 바뀐다.
export function OrderProgressStepper({ status }: { status: ProgressStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.status === status);
  const fill = currentIndex / (STEPS.length - 1);

  return (
    <div className="relative">
      <span aria-hidden="true" className="absolute top-4 bottom-4 left-[15px] w-0.5 rounded-full bg-iron-line" />
      <motion.span
        aria-hidden="true"
        className="absolute top-4 left-[15px] w-0.5 origin-top rounded-full bg-linear-to-b from-caramel to-syrup shadow-[0_0_12px_rgba(255,181,71,0.7)]"
        initial={{ height: 0 }}
        animate={{ height: `calc((100% - 32px) * ${fill})` }}
        transition={{ duration: 1, ease: [0.6, 0, 0.2, 1] }}
      />
      <ol className="relative flex flex-col gap-5">
        {STEPS.map((step, index) => {
          const state: StepState = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          const isLast = index === STEPS.length - 1;
          return (
            <li key={step.status} data-state={state} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-500 ${
                  state === "done"
                    ? "bg-caramel text-dough"
                    : state === "current"
                      ? "pulse-dot bg-syrup text-molasses"
                      : "border border-iron-line bg-iron-2 text-dough-dim"
                }`}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 24 24" className="size-4">
                    <motion.path
                      d="M5 12.5l4.5 4.5L19 7.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.35, delay: 0.2 + index * 0.12 }}
                    />
                  </svg>
                ) : (
                  <span className="font-num">{index + 1}</span>
                )}
              </span>
              <span className="flex flex-col">
                <span className={`text-[15px] transition-colors duration-500 ${LABEL_CLASS[state]}`}>
                  {step.label}
                  {state === "done" && <span className="sr-only"> (완료)</span>}
                </span>
                {state === "current" && !isLast && (
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className="text-xs font-medium text-syrup"
                  >
                    진행 중...
                  </motion.span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
