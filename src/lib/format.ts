const WON = new Intl.NumberFormat("ko-KR");

export function formatWon(amount: number): string {
    return `${WON.format(amount)}원`;
}

// 옵션 추가 가격 표기(디자인): 0원은 "무료".
export function formatOptionPrice(extraPrice: number): string {
    return extraPrice === 0 ? "무료" : `+₩${WON.format(extraPrice)}`;
}
