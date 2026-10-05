"use client";

import Link from "next/link";
import { use, useState, type ReactNode } from "react";
import { OrderCompleteCard } from "@/components/customer/OrderCompleteCard";
import { OrderProgressStepper, type ProgressStatus } from "@/components/customer/OrderProgressStepper";
import { OrderStatusHeader } from "@/components/customer/OrderStatusHeader";
import { OrderStatusItems } from "@/components/customer/OrderStatusItems";
import { StaffCallButton } from "@/components/customer/StaffCallButton";
import type { OrderStatus } from "@/domain/order/status";
import { useOrderStatus } from "@/features/customer/useOrderStatus";
import type { OrderStatusDto } from "@/lib/dto/order";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PROGRESS_STATUSES: readonly OrderStatus[] = ["pending", "paid", "cooking", "completed"];

// F-11 "내 앞의 미완료 주문 수"를 보여 줄 상태
const WAITING_STATUSES: readonly OrderStatus[] = ["pending", "paid", "cooking"];

// PRD 화면 표 "만료·취소 → 상태와 안내 문구" — 스테퍼 대신 보여 준다.
const CLOSED_NOTICES: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  cancelled: { title: "주문이 취소됐어요", body: "궁금한 점은 부스 직원에게 문의해 주세요." },
  refunded: { title: "주문이 환불됐어요", body: "궁금한 점은 부스 직원에게 문의해 주세요." },
  expired: {
    title: "주문이 만료됐어요",
    body: "결제가 제시간에 확인되지 않았어요. 필요하면 메뉴에서 다시 주문해 주세요.",
  },
};

const CARD = "rounded-3xl border border-line bg-white p-5";
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep";
// 글씨가 왼쪽에 있어 그라데이션의 어두운 쪽(대비 4.7:1 이상) 위에 놓인다.
const PRIMARY_CTA = `flex h-13 w-full items-center rounded-2xl bg-linear-to-br from-brand-deep to-brand-amber px-5 text-base font-bold text-white shadow-md ${FOCUS_RING}`;
const SECONDARY_CTA = `flex h-13 w-full items-center rounded-2xl border border-badge bg-badge/20 px-5 text-base font-bold text-brand-deep ${FOCUS_RING}`;

function isProgressStatus(status: OrderStatus): status is ProgressStatus {
  return PROGRESS_STATUSES.includes(status);
}

export default function OrderStatusPage({ params, searchParams }: PageProps) {
  const { token } = use(params);
  const { new: justOrdered } = use(searchParams);
  // 결제 화면이 주문 성공 뒤 ?new=1을 붙인다 — 그때만 완료 보기를 먼저 보여 준다.
  return <OrderStatusScreen key={token} token={token} openedFromCheckout={justOrdered === "1"} />;
}

// 보기 전환은 이 컴포넌트 안의 상태라 훅(폴링)은 그대로 이어진다.
function OrderStatusScreen({ token, openedFromCheckout }: { token: string; openedFromCheckout: boolean }) {
  const state = useOrderStatus(token);
  const [view, setView] = useState<"complete" | "status">(openedFromCheckout ? "complete" : "status");

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "notFound") return <NotFoundState />;
  if (state.status === "error") return <ErrorState onRetry={state.retry} />;

  const notice = state.refreshFailed ? <RefreshFailedNotice onRetry={state.retry} /> : null;
  if (view === "complete") {
    return <CompleteView order={state.order} notice={notice} onShowStatus={() => setView("status")} />;
  }
  return (
    <StatusView
      token={token}
      order={state.order}
      notice={notice}
      onBack={openedFromCheckout ? () => setView("complete") : undefined}
    />
  );
}

function Screen({ children, bottom }: { children: ReactNode; bottom?: ReactNode }) {
  return (
    <main className="min-h-screen bg-cream">
      <div className={`mx-auto flex max-w-md flex-col ${bottom ? "pb-44" : "pb-8"}`}>{children}</div>
      {bottom && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white">
          <div className="mx-auto flex max-w-md flex-col gap-1 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {bottom}
          </div>
        </div>
      )}
    </main>
  );
}

function MenuLinkButton() {
  return (
    <Link href="/" className={SECONDARY_CTA}>
      메뉴로 돌아가기
    </Link>
  );
}

function CompleteView({
  order,
  notice,
  onShowStatus,
}: {
  order: OrderStatusDto;
  notice: ReactNode;
  onShowStatus: () => void;
}) {
  const cashDue = order.paymentMethod === "cash" && order.status === "pending";
  return (
    <Screen
      bottom={
        <>
          <button type="button" onClick={onShowStatus} className={PRIMARY_CTA}>
            주문 현황 보기 <span aria-hidden="true">→</span>
          </button>
          <Link href="/" className={`self-start px-1 py-2 text-sm text-neutral-600 ${FOCUS_RING}`}>
            메뉴로 돌아가기
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4 pt-6">
        {notice}
        <OrderCompleteCard
          pickupNumber={order.pickupNumber}
          totalAmount={order.totalAmount}
          paymentMethod={order.paymentMethod}
        />
        {cashDue && (
          <section aria-labelledby="payment-guide" className={CARD}>
            <h2 id="payment-guide" className="font-bold text-neutral-900">
              결제 안내
            </h2>
            <p className="mt-1 text-sm text-neutral-700">부스에서 현금으로 결제해 주세요.</p>
          </section>
        )}
      </div>
    </Screen>
  );
}

function StatusView({
  token,
  order,
  notice,
  onBack,
}: {
  token: string;
  order: OrderStatusDto;
  notice: ReactNode;
  onBack?: () => void;
}) {
  const closedNotice = CLOSED_NOTICES[order.status];
  return (
    <Screen bottom={<MenuLinkButton />}>
      <OrderStatusHeader
        pickupNumber={order.pickupNumber}
        status={order.status}
        aheadCount={WAITING_STATUSES.includes(order.status) ? order.aheadCount : null}
        onBack={onBack}
      />
      <div className="flex flex-col gap-4 px-4 pt-4">
        {notice}
        {isProgressStatus(order.status) && (
          <section aria-labelledby="progress-heading" className={CARD}>
            <h2 id="progress-heading" className="text-xs font-semibold tracking-[0.2em] text-brand-deep">
              진행 상황
            </h2>
            <div className="mt-4">
              <OrderProgressStepper status={order.status} />
            </div>
          </section>
        )}
        {closedNotice && (
          <section aria-labelledby="closed-heading" className={CARD}>
            <h2 id="closed-heading" className="text-lg font-bold text-neutral-900">
              {closedNotice.title}
            </h2>
            <p className="mt-1 text-sm text-neutral-700">{closedNotice.body}</p>
          </section>
        )}
        <OrderStatusItems items={order.items} totalAmount={order.totalAmount} paymentMethod={order.paymentMethod} />
        <StaffCallButton token={token} />
      </div>
    </Screen>
  );
}

function RefreshFailedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-2xl border border-badge bg-badge/30 px-4 py-3 text-sm text-neutral-800"
    >
      <p>최신 상태를 불러오지 못했어요. 5초마다 자동으로 다시 확인해요.</p>
      <button type="button" onClick={onRetry} className={`shrink-0 font-semibold text-brand-deep underline ${FOCUS_RING}`}>
        다시 시도
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <Screen>
      <div className="px-4 pt-10">
        <p role="status" className={`${CARD} text-center text-neutral-700`}>
          주문 정보를 불러오는 중이에요…
        </p>
      </div>
    </Screen>
  );
}

function NotFoundState() {
  return (
    <Screen bottom={<MenuLinkButton />}>
      <div className="px-4 pt-10">
        <section className={CARD}>
          <h1 className="text-xl font-bold text-neutral-900">주문을 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-neutral-700">주문 완료 화면의 주소가 맞는지 확인해 주세요.</p>
        </section>
      </div>
    </Screen>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen bottom={<MenuLinkButton />}>
      <div className="px-4 pt-10">
        <section className={CARD}>
          <h1 className="text-xl font-bold text-neutral-900">주문 정보를 불러오지 못했어요</h1>
          <p className="mt-2 text-sm text-neutral-700">
            네트워크 연결을 확인해 주세요. 5초마다 자동으로 다시 확인해요.
          </p>
          <button type="button" onClick={onRetry} className={`${PRIMARY_CTA} mt-4`}>
            다시 시도
          </button>
        </section>
      </div>
    </Screen>
  );
}
