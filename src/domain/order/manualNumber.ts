// 수기 주문 번호의 표시 형식(T-28). DB에는 숫자(1)로 저장하고 화면·CSV는 "M-001"로 보여 준다(T-30 운영 매뉴얼의 M- 번호 체계).
export const MANUAL_NUMBER_MAX = 9999;

export function formatManualNumber(manualNumber: number): string {
    return `M-${String(manualNumber).padStart(3, "0")}`;
}
