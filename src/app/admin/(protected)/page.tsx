export default function AdminDashboardPage() {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
                <h1 className="text-xl font-bold text-gray-900">
                    관리자 대시보드
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    축제 부스 주문 실시간 접수 및 상태 관리 시스템입니다.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
                    <div className="text-sm font-medium text-gray-500">
                        실시간 주문 대시보드
                    </div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">
                        준비 완료
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                        Realtime 채널 및 주문 피드 연동 대기 중
                    </p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
                    <div className="text-sm font-medium text-gray-500">
                        메뉴·재고 관리
                    </div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">
                        T-20
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                        품절 토글 및 재고 수량 관리
                    </p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
                    <div className="text-sm font-medium text-gray-500">
                        매출 통계
                    </div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">
                        T-21
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                        매출 집계 및 통계 내보내기
                    </p>
                </div>
            </div>
        </div>
    );
}
