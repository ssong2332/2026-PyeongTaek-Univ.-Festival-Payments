// 취소·환불·만료는 이 단계에 없다 — 화면이 스테퍼 대신 상태 안내를 보여 준다.
export type ProgressStatus = "pending" | "paid" | "cooking" | "completed";

type StepState = "done" | "current" | "upcoming";

const STEPS: readonly { status: ProgressStatus; label: string }[] = [
  { status: "pending", label: "주문 접수됨" },
  { status: "paid", label: "결제 완료" },
  { status: "cooking", label: "호떡 굽는 중" },
  { status: "completed", label: "완성! 수령해주세요" },
];

const CIRCLE_CLASS: Record<StepState, string> = {
  done: "bg-brand-deep text-white",
  current: "bg-linear-to-br from-brand-deep to-brand-amber text-white ring-4 ring-brand/20",
  upcoming: "bg-badge/60 text-brand-deep",
};

const LABEL_CLASS: Record<StepState, string> = {
  done: "font-semibold text-neutral-700",
  current: "font-bold text-neutral-900",
  upcoming: "font-semibold text-neutral-500",
};

// 현금 주문은 pending → cooking으로 바로 넘어가므로, 현재 단계보다 앞은 거쳤는지와 관계없이 완료로 표시한다.
export function OrderProgressStepper({ status }: { status: ProgressStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.status === status);

  return (
    <ol className="flex flex-col">
      {STEPS.map((step, index) => {
        const state: StepState = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
        const isLast = index === STEPS.length - 1;
        return (
          <li
            key={step.status}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {!isLast && <span aria-hidden="true" className="absolute top-8 bottom-0 left-[15px] w-px bg-badge" />}
            <span
              aria-hidden="true"
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${CIRCLE_CLASS[state]}`}
            >
              {state === "done" ? "✓" : index + 1}
            </span>
            <span className="flex flex-col pt-1">
              <span className={LABEL_CLASS[state]}>
                {step.label}
                {state === "done" && <span className="sr-only"> (완료)</span>}
              </span>
              {state === "current" && !isLast && <span className="text-xs text-neutral-500">진행 중...</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
