"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { SPRING_BOUNCY } from "@/components/motion/presets";
import { BankIcon, CheckIcon } from "@/components/ui/icons";
import { useTransferReport } from "@/features/customer/useTransferReport";
import { useTransferSettings } from "@/features/customer/useTransferSettings";
import { formatWon } from "@/lib/format";
import { formatPickupNumber } from "./PickupNumberDisplay";

const CARD = "iron-card rounded-3xl p-5";
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup";
const PRIMARY_BUTTON = `cta-shine flex h-13 w-full items-center justify-center rounded-2xl bg-linear-to-br from-brand-deep to-brand-amber px-5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.97] disabled:opacity-60 ${FOCUS_RING}`;
const SECONDARY_BUTTON = `flex h-11 shrink-0 items-center justify-center rounded-xl border border-syrup/40 bg-iron-3 px-3 text-sm font-bold text-dough ${FOCUS_RING}`;

const COPY_FEEDBACK_MS = 2_000;

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// 숫자를 읽은 끝소리에 받침(ㄹ 제외)이 있으면 "으로": 0(영)·3(삼)·6(육). 예: 005로, 010으로, 013으로.
function withRo(pickupNumber: number): string {
  return [0, 3, 6].includes(pickupNumber % 10) ? "으로" : "로";
}

export interface TransferGuideProps {
  token: string;
  pickupNumber: number;
  totalAmount: number;
  transferReportedAt: string | null;
  canTransferReport: boolean;
  // 신고 성공·409 뒤 주문 상태를 바로 다시 읽게 한다(useOrderStatus.retry).
  onReported?: () => void;
}

// T-31 (F-42) 계좌 안내 + T-32 (F-43) [송금했어요]. 계좌이체·결제대기 주문의 완료·현황 보기에서만 쓴다(호출 쪽이 판단).
export function TransferGuide({
  token,
  pickupNumber,
  totalAmount,
  transferReportedAt,
  canTransferReport,
  onReported,
}: TransferGuideProps) {
  const settings = useTransferSettings();
  const transfer = useTransferReport(token, transferReportedAt, onReported);

  return (
    <section aria-labelledby="transfer-guide" className={CARD}>
      <div className="flex items-center justify-between">
        <h2 id="transfer-guide" className="font-display flex items-center gap-2 text-xl text-dough">
          <BankIcon className="size-5 text-syrup" />
          계좌이체 안내
        </h2>
      </div>

      {settings.status === "loading" && (
        <p role="status" className="mt-3 text-sm text-dough-dim">
          계좌 정보를 불러오는 중이에요…
        </p>
      )}

      {settings.status === "error" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-dough-dim">계좌 정보를 불러오지 못했어요.</p>
          <button type="button" onClick={settings.retry} className={SECONDARY_BUTTON}>
            다시 시도
          </button>
        </div>
      )}

      {settings.status === "ready" && !settings.settings.configured && (
        <p className="mt-3 rounded-2xl bg-syrup/10 px-4 py-3 text-sm font-bold text-dough">
          계좌 정보를 준비 중이에요. 부스 직원에게 문의해 주세요.
        </p>
      )}

      {settings.status === "ready" && settings.settings.configured && (
        <>
          <dl className="mt-4 flex flex-col gap-3">
            <div>
              <dt className="text-xs text-dough-dim">은행</dt>
              <dd className="mt-0.5 text-lg font-bold text-dough">{settings.settings.bankName}</dd>
            </div>
            <div>
              <dt className="text-xs text-dough-dim">계좌번호</dt>
              <dd className="mt-0.5">
                {/* 클립보드를 못 쓰는 브라우저에서 길게 눌러 한 번에 선택되도록 select-all. 하이픈에서 줄이 갈리지 않게 nowrap */}
                <span className="font-display block select-all whitespace-nowrap text-3xl tabular-nums text-dough">
                  {settings.settings.accountNumber}
                </span>
                <CopyButton text={settings.settings.accountNumber} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-dough-dim">예금주</dt>
              <dd className="mt-0.5 text-lg font-bold text-dough">{settings.settings.accountHolder}</dd>
            </div>
            <div>
              <dt className="text-xs text-dough-dim">입금할 금액</dt>
              <dd className="font-display mt-0.5 text-3xl text-syrup">{formatWon(totalAmount)}</dd>
            </div>
          </dl>

          <p className="mt-4 rounded-2xl border border-syrup/40 bg-syrup/10 px-4 py-3 text-sm font-bold text-dough">
            입금자명은 픽업 번호 <span className="tabular-nums">{formatPickupNumber(pickupNumber)}</span>
            {withRo(pickupNumber)} 적어 주세요.
          </p>

          <TransferReport
            reportedAt={transfer.reportedAt}
            canReport={canTransferReport}
            submitting={transfer.submitting}
            error={transfer.error}
            onReport={transfer.report}
          />
        </>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (result !== "copied") return;
    const timer = setTimeout(() => setResult(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }

  return (
    <div className="mt-2 flex items-center gap-3">
      <button type="button" onClick={() => void copy()} className={`${SECONDARY_BUTTON} whitespace-nowrap`}>
        계좌번호 복사
      </button>
      <p aria-live="polite" className="text-sm text-dough-dim">
        <AnimatePresence mode="wait">
          {result && (
            <motion.span
              key={result}
              initial={{ opacity: 0, scale: 0.6, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={SPRING_BOUNCY}
              className={`inline-block ${result === "copied" ? "font-bold text-ok" : ""}`}
            >
              {result === "copied" ? "복사했어요" : "계좌번호를 길게 눌러 복사해 주세요"}
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}

function TransferReport({
  reportedAt,
  canReport,
  submitting,
  error,
  onReport,
}: {
  reportedAt: string | null;
  canReport: boolean;
  submitting: boolean;
  error: "stateChanged" | "failed" | null;
  onReport: () => void;
}) {
  if (reportedAt) {
    return (
      <motion.p
        role="status"
        initial={{ opacity: 0, scale: 0.9, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING_BOUNCY}
        className="mt-4 flex items-start gap-2 rounded-2xl bg-iron px-4 py-3 text-sm text-dough"
      >
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-syrup" />
        <span>
          <span className="font-bold">송금 신고 완료 {KST_TIME.format(new Date(reportedAt))}</span>
          <br />
          직원이 입금을 확인하면 조리를 시작해요.
        </span>
      </motion.p>
    );
  }
  if (!canReport) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <button type="button" onClick={onReport} disabled={submitting} className={PRIMARY_BUTTON}>
        {submitting ? "신고하는 중…" : "송금했어요"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-dough">
          {error === "stateChanged"
            ? "주문 상태가 바뀌었어요. 화면이 곧 새로 고쳐져요."
            : "신고하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요."}
        </p>
      )}
    </div>
  );
}
