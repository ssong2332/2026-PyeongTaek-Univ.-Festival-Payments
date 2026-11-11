import type { StatsDto } from "@/lib/dto/stats";
import styles from "./HourlyMenuHeatmap.module.css";

export function HourlyMenuHeatmap({ sales }: { sales: StatsDto["hourlyByMenu"] }) {
    const menuTotals = new Map<string, { nameKo: string; quantity: number }>();
    const cells = new Map<string, number>();
    let maximum = 0;
    for (const sale of sales) {
        const current = menuTotals.get(sale.menuItemId);
        if (current) current.quantity += sale.quantity;
        else menuTotals.set(sale.menuItemId, { nameKo: sale.nameKo, quantity: sale.quantity });
        cells.set(`${sale.hour}:${sale.menuItemId}`, sale.quantity);
        maximum = Math.max(maximum, sale.quantity);
    }
    const menus = [...menuTotals].sort((a, b) => b[1].quantity - a[1].quantity || a[0].localeCompare(b[0]));

    return <section className={styles.section} aria-label="시간대별 메뉴 판매 히트맵">
        <h2>시간대별 메뉴 판매</h2>
        <p className={styles.hint}>주문 시각(KST) 기준 · 결제확인·조리중·완료 주문</p>
        {menus.length === 0 ? <p className={styles.empty}>데이터 없음</p> :
            <div className={styles.scroll}>
                <table className={styles.table}>
                    <caption>시간대별 메뉴 판매 수량</caption>
                    <thead><tr><th scope="col">시간</th>{menus.map(([id, menu]) =>
                        <th key={id} scope="col">{menu.nameKo}</th>)}</tr></thead>
                    <tbody>{Array.from({ length: 24 }, (_, hour) => <tr key={hour}>
                        <th scope="row">{String(hour).padStart(2, "0")}–{String(hour + 1).padStart(2, "0")}시</th>
                        {menus.map(([id, menu]) => {
                            const quantity = cells.get(`${hour}:${id}`) ?? 0;
                            const opacity = maximum === 0 ? 0 : 0.12 + 0.76 * quantity / maximum;
                            return <td key={id} aria-label={`${hour}시부터 ${hour + 1}시 ${menu.nameKo} ${quantity}개`}
                                style={quantity > 0 ? { backgroundColor: `rgba(255, 181, 71, ${opacity})` } : undefined}>
                                {quantity > 0 ? `${quantity}개` : ""}
                            </td>;
                        })}
                    </tr>)}</tbody>
                </table>
            </div>}
    </section>;
}
