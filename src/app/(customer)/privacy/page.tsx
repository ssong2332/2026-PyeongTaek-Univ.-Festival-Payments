// PRD F-12 1차·N-15. 전화번호 수집(2차 F-39) 착수 시 수집 항목·이용 목적을 이 고지에 더한다.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">개인정보 고지</h1>

        <section aria-labelledby="privacy-collected" className="rounded-2xl border border-line bg-white p-5">
          <h2 id="privacy-collected" className="text-xs font-semibold tracking-[0.2em] text-brand-deep">
            수집하는 개인정보
          </h2>
          <p className="mt-2 text-lg font-bold text-neutral-900">없음</p>
          <p className="mt-1 text-sm text-neutral-700">
            이 서비스는 주문할 때 개인정보를 수집하지 않습니다. 별도의 동의 절차도 없습니다.
          </p>
          {/* #89·DECISIONS #54: 메뉴판 "내 주문 현황 보기"용 기기 보관(features/customer/myOrders.ts). 보관 기간을 바꾸면 이 문구도 바꾼다. */}
          <p className="mt-1 text-sm text-neutral-700">
            이 기기에 최근 주문의 현황 링크와 픽업 번호를 24시간 보관합니다. 서버로 보내지 않습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-disposal" className="rounded-2xl border border-line bg-white p-5">
          <h2 id="privacy-disposal" className="text-xs font-semibold tracking-[0.2em] text-brand-deep">
            주문 데이터 파기
          </h2>
          <p className="mt-2 text-lg font-bold text-neutral-900">2026-11-08</p>
          <p className="mt-1 text-sm text-neutral-700">
            주문 데이터는 축제 종료(2026-10-08) 후 한 달이 되는 2026-11-08에 파기합니다.
          </p>
        </section>
      </div>
    </main>
  );
}
