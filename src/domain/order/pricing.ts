// 장바구니 합계는 화면 표시용이다. 주문 금액의 권위는 서버(create_order)가 다시 계산한 값이다(N-03).

export interface PricedOption {
    readonly extraPrice: number;
}

export interface PricedLine {
    readonly unitPrice: number;
    readonly quantity: number;
    readonly options: readonly PricedOption[];
}

// DB order_items의 line_total = (unit_price + options_price) * quantity와 같은 규칙.
export function lineTotal(line: PricedLine): number {
    const optionsPrice = line.options.reduce((sum, option) => sum + option.extraPrice, 0);
    return (line.unitPrice + optionsPrice) * line.quantity;
}

export function cartTotal(lines: readonly PricedLine[]): number {
    return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}
