"use client";

import { useEffect, useState } from "react";
import type { StatsDto } from "@/lib/dto/stats";
import { HourlyMenuHeatmap } from "./HourlyMenuHeatmap";
import styles from "./StatsPanel.module.css";

const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function StatsPanel({ loadStats, initialDate }: {
    loadStats: (date: string) => Promise<StatsDto>;
    initialDate?: string;
}) {
    const [date, setDate] = useState(initialDate ?? todayKst);
    const [version, setVersion] = useState(0);
    const [summary, setSummary] = useState<StatsDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        loadStats(date).then(result => {
            if (active) { setSummary(result); setError(false); setLoading(false); }
        }).catch(() => {
            if (active) { setSummary(null); setError(true); setLoading(false); }
        });
        return () => { active = false; };
    }, [date, version, loadStats]);

    const rows = summary?.byMenu.map(menu => ({
        ...menu, percent: Math.round(menu.ratio * 1000) / 10,
    })) ?? [];
    return <section className={styles.panel} aria-label="매출 통계">
        <div className={styles.heading}>
            <div><h1>매출 통계</h1><p>결제확인·조리중·완료 주문의 매출과 메뉴별 판매 수량</p></div>
            <div className={styles.controls}>
                <label htmlFor="stats-date">조회 날짜</label>
                <select id="stats-date" value={date} onChange={event => {
                    setDate(event.target.value); setSummary(null); setLoading(true); setError(false);
                }}>
                    <option value={todayKst()}>오늘</option>
                    <option value="2026-10-07">10월 7일</option>
                    <option value="2026-10-08">10월 8일</option>
                    <option value="all">전체</option>
                </select>
                <button type="button" onClick={() => { setSummary(null); setLoading(true); setError(false); setVersion(value => value + 1); }}>새로고침</button>
                <a className={styles.download} href={`/api/admin/stats/csv?${new URLSearchParams({ from: date, to: date })}`} download>
                    CSV 다운로드
                </a>
            </div>
        </div>
        {loading ? <p role="status" className={styles.message}>통계를 불러오는 중입니다…</p> :
            error ? <p role="alert" className={styles.error}>통계를 불러오지 못했습니다. 새로고침해 주세요.</p> : summary && <>
                <div className={styles.summary} aria-label="매출 요약">
                    <article><span>매출</span><strong>{money(summary.sales)}</strong></article>
                    <article><span>주문 건수</span><strong>{summary.orderCount.toLocaleString("ko-KR")}건</strong></article>
                    <article><span>환불 금액</span><strong>{money(summary.refundedAmount)}</strong></article>
                    <article><span>환불 건수</span><strong>{summary.refundedCount.toLocaleString("ko-KR")}건</strong></article>
                </div>
                <p className={styles.rule}>매출은 환불된 주문을 제외한 금액입니다. 환불 금액과 건수는 별도로 표시합니다.</p>
                <section className={styles.chartSection} aria-label="메뉴별 판매율">
                    <h2>메뉴별 판매율</h2>
                    {rows.length === 0 ? <p className={styles.message}>데이터 없음</p> : <>
                        <div className={styles.bars} aria-hidden="true">
                            {rows.map(row => <div className={styles.barRow} key={row.menuItemId}>
                                <span className={styles.barLabel}>{row.nameKo}</span>
                                <span className={styles.barTrack}><span className={styles.barFill} style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }} /></span>
                                <span className={styles.barPercent}>{row.percent.toFixed(1)}%</span>
                            </div>)}
                        </div>
                        <table className={styles.table}><caption>메뉴별 판매 수량과 비율</caption>
                            <thead><tr><th scope="col">메뉴</th><th scope="col">수량</th><th scope="col">비율</th></tr></thead>
                            <tbody>{rows.map(row => <tr key={row.menuItemId}><th scope="row">{row.nameKo}</th>
                                <td>{row.quantity.toLocaleString("ko-KR")}개</td><td>{row.percent.toFixed(1)}%</td></tr>)}</tbody>
                        </table>
                    </>}
                </section>
                <HourlyMenuHeatmap sales={summary.hourlyByMenu} />
            </>}
    </section>;
}
