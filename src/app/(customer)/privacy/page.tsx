// PRD F-12 1차·N-15. 전화번호 수집(2차 F-39) 착수 시 수집 항목·이용 목적을 이 고지에 더한다.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FDF8F3] px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">개인정보 고지</h1>

        <section aria-labelledby="privacy-collected" className="rounded-2xl border border-[#F3E7DA] bg-white p-5">
          <h2 id="privacy-collected" className="text-xs font-semibold tracking-[0.2em] text-[#8B3A1E]">
            수집하는 개인정보
          </h2>
          <p className="mt-2 text-lg font-bold text-neutral-900">없음</p>
          <p className="mt-1 text-sm text-neutral-700">
            이 서비스는 주문할 때 개인정보를 수집하지 않습니다. 별도의 동의 절차도 없습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-disposal" className="rounded-2xl border border-[#F3E7DA] bg-white p-5">
          <h2 id="privacy-disposal" className="text-xs font-semibold tracking-[0.2em] text-[#8B3A1E]">
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
