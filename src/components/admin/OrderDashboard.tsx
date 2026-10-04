"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BarChart3, Bell, CheckCircle, ClipboardList, Clock, Flame, LayoutDashboard, Search, Settings2, XCircle } from "lucide-react";
import { HotteokMascot } from "@/components/ui/HotteokMascot";
import type { AdminOrderDto, OrderStatus, TransitionAction } from "@/lib/dto/adminOrder";
import type { StatsDto } from "@/lib/dto/stats";
import { StatsPanel } from "./StatsPanel";
import { OrderActionButtons } from "./OrderActionButtons";
import { OrderCancelRefund, type CancelRefundInput } from "./OrderCancelRefund";
import { TransitionRequestError } from "@/features/admin/transitionError";
import styles from "./OrderDashboard.module.css";

const LABELS: Record<OrderStatus, string> = {
    pending: "결제대기", paid: "결제확인", cooking: "조리중", completed: "완료",
    cancelled: "취소", refunded: "환불", expired: "만료",
};
type Filter = "all" | "unacknowledged" | OrderStatus;
export function isUnacknowledged(order: AdminOrderDto) {
    return order.acknowledgedAt === null && ["pending", "paid", "cooking"].includes(order.status);
}
const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const time = (value: string) => new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const pickup = (value: number) => String(value).padStart(3, "0");

export interface OrderDashboardProps {
    orders: AdminOrderDto[];
    isLoading?: boolean;
    error?: string | null;
    preview?: boolean;
    onReload: () => Promise<void>;
    onAcknowledge: (id: string) => Promise<void>;
    onSearch: (pickupNumber: number) => Promise<AdminOrderDto[]>;
    onLoadStats: (date: string) => Promise<StatsDto>;
    onTransition: (id: string, action: TransitionAction, input?: CancelRefundInput) => Promise<void>;
    settingsPanel?: ReactNode;
}

export function OrderDashboard({ orders, isLoading = false, error, preview = false,
    onReload, onAcknowledge, onSearch, onLoadStats, onTransition, settingsPanel }: OrderDashboardProps) {
    const [page, setPage] = useState<"dashboard" | "orders" | "stats" | "settings">("dashboard");
    const [filter, setFilter] = useState<Filter>("all");
    const [query, setQuery] = useState("");
    const [searchNumber, setSearchNumber] = useState<number | null>(null);
    const [searchResults, setSearchResults] = useState<AdminOrderDto[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<TransitionAction | null>(null);
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");
    const [transitionError, setTransitionError] = useState<{ id: string; message: string } | null>(null);
    const searchVersion = useRef(0);
    const acknowledging = useRef(false);
    const transitioning = useRef(false);
    const unacknowledged = orders.filter(isUnacknowledged).length;
    const source = searchNumber === null ? orders : searchResults.map(order => {
        const live = orders.find(item => item.id === order.id);
        return live && live.updatedAt >= order.updatedAt ? live : order;
    });
    const visible = source.filter(order => filter === "all" ||
        (filter === "unacknowledged" ? isUnacknowledged(order) : order.status === filter))
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
    const selected = source.find(order => order.id === selectedId);
    const stats = [
        { label: "전체 주문", value: orders.length, filter: "all", icon: ClipboardList },
        { label: "미확인", value: unacknowledged, filter: "unacknowledged", icon: Bell },
        { label: "결제대기", value: orders.filter(o => o.status === "pending").length, filter: "pending", icon: Clock },
        { label: "조리중", value: orders.filter(o => o.status === "cooking").length, filter: "cooking", icon: Flame },
        { label: "완료", value: orders.filter(o => o.status === "completed").length, filter: "completed", icon: CheckCircle },
        { label: "취소", value: orders.filter(o => o.status === "cancelled").length, filter: "cancelled", icon: XCircle },
    ] as const;

    function clearSearch() {
        searchVersion.current++;
        setSearching(false); setSearchNumber(null); setSearchResults([]); setQuery(""); setSelectedId(null);
    }
    async function search(event: FormEvent) {
        event.preventDefault();
        const value = query.trim();
        if (!value) { clearSearch(); return; }
        const number = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) {
            setActionError("픽업 번호는 1 이상의 숫자로 입력해 주세요."); return;
        }
        const version = ++searchVersion.current;
        setSearching(true); setActionError(""); setSelectedId(null); setFilter("all");
        setSearchNumber(number); setSearchResults([]);
        try {
            const local = orders.filter(order => order.pickupNumber === number);
            const result = local.length ? local : await onSearch(number);
            if (version === searchVersion.current) setSearchResults(result);
        } catch { if (version === searchVersion.current) setActionError("검색에 실패했습니다. 다시 검색해 주세요."); }
        finally { if (version === searchVersion.current) setSearching(false); }
    }
    async function acknowledge(order: AdminOrderDto) {
        if (acknowledging.current || transitioning.current) return;
        acknowledging.current = true; setPendingId(order.id); setActionError(""); setTransitionError(null); setNotice("");
        try {
            await onAcknowledge(order.id);
            setNotice(`픽업 #${pickup(order.pickupNumber)} 주문을 확인했습니다.`);
            if (searchNumber !== null) {
                const version = searchVersion.current;
                try {
                    const result = await onSearch(searchNumber);
                    if (version === searchVersion.current) setSearchResults(result);
                } catch {
                    if (version === searchVersion.current) {
                        setActionError("주문 확인은 완료됐지만 검색 결과를 새로고침하지 못했습니다.");
                    }
                }
            }
        } catch { setActionError("확인 처리에 실패했습니다. 주문 상태를 확인하고 다시 시도해 주세요."); }
        finally { acknowledging.current = false; setPendingId(null); }
    }
    async function transitionOrder(order: AdminOrderDto, action: TransitionAction, input?: CancelRefundInput) {
        if (transitioning.current || acknowledging.current || !order.availableActions.includes(action)) return;
        transitioning.current = true; setPendingId(order.id); setPendingAction(action);
        setActionError(""); setTransitionError(null); setNotice("");
        try {
            if (input) await onTransition(order.id, action, input);
            else await onTransition(order.id, action);
            setNotice(`픽업 #${pickup(order.pickupNumber)} 주문 상태를 변경했습니다.`);
            if (searchNumber !== null) {
                const version = searchVersion.current;
                try {
                    const result = await onSearch(searchNumber);
                    if (version === searchVersion.current) setSearchResults(result);
                } catch {
                    if (version === searchVersion.current) {
                        setActionError("상태는 변경됐지만 검색 결과를 새로고침하지 못했습니다.");
                    }
                }
            }
        } catch (error) {
            const message = error instanceof TransitionRequestError
                ? error.message
                : "상태 변경에 실패했습니다. 주문 상태를 확인하고 다시 시도해 주세요.";
            if (action === "cancel" || action === "refund") setActionError(message);
            else setTransitionError({ id: order.id, message });
        } finally {
            transitioning.current = false; setPendingId(null); setPendingAction(null);
        }
    }
    async function reload() {
        setActionError("");
        try { await onReload(); } catch { setActionError("새로고침에 실패했습니다."); }
    }

    return <div className={styles.shell}>
        <aside className={styles.sidebar}>
            <nav aria-label="관리자 메뉴">{([
                ["dashboard", "대시보드", LayoutDashboard], ["orders", "주문 관리", ClipboardList],
                ["stats", "매출 통계", BarChart3],
            ] as const).map(([id, label, Icon]) => <button key={id} aria-current={page === id ? "page" : undefined}
                onClick={() => { setPage(id); setFilter("all"); clearSearch(); }}><Icon size={18} />{label}</button>)}
                {settingsPanel && <button aria-current={page === "settings" ? "page" : undefined}
                    onClick={() => setPage("settings")}><Settings2 size={18} />운영 설정</button>}
            </nav>
            <p className={styles.sideNote}><Bell size={16} /> 미확인 주문 {unacknowledged}건</p>
            <div className={styles.sideMascots}>
                <HotteokMascot variant="chef" size={58} motion="bob" />
                <HotteokMascot variant="wave" size={46} />
                <HotteokMascot variant="coin" size={36} motion="sway" />
            </div>
        </aside>
        <div className={styles.main}>
            <header className={styles.topbar}><strong>{page === "dashboard" ? "대시보드" : page === "stats" ? "매출 통계" : page === "settings" ? "운영 설정" : "주문 관리"}</strong>
                {page !== "stats" && page !== "settings" && <button onClick={reload} disabled={isLoading}>새로고침</button>}</header>
            {preview && <div className={styles.preview}>목업 미리보기 · 실제 주문과 연결되지 않습니다.</div>}
            <div className={styles.content}>
                {page === "stats" ? <StatsPanel loadStats={onLoadStats} initialDate={preview ? "all" : undefined} /> : page === "settings" ? settingsPanel : <>
                <div className={styles.heading}><span className={styles.logo}><HotteokMascot variant="chef" size={44} /></span><div>
                    <h1>{page === "dashboard" ? "호떡 운영 대시보드" : "현장 주문판"}</h1><p>축제 현장 주문을 한눈에 확인하세요</p></div></div>
                <p role="status" className={styles.notice}>{notice || `미확인 주문 ${unacknowledged}건`}</p>
                {(error || actionError) && <div role="alert" className={styles.error}>{actionError || "주문을 불러오지 못했습니다. 새로고침해 주세요."}</div>}
                {page === "dashboard" && <section className={styles.stats} aria-label="오늘 주문 요약">
                    {stats.map(s => <button key={s.label} className={styles.stat} onClick={() => { setPage("orders"); setFilter(s.filter); clearSearch(); }}>
                        <s.icon size={20} /><strong>{isLoading ? "—" : s.value}</strong><span>{s.label}</span></button>)}
                </section>}
                <section className={`${styles.board} ${selected ? styles.hasSelection : ""}`} aria-label="주문 목록과 상세">
                    <div className={styles.list}>
                        <h2>{searchNumber === null ? "오늘 주문" : `픽업 #${pickup(searchNumber)} 검색 결과`}</h2>
                        <form className={styles.search} onSubmit={search}>
                            <label className={styles.srOnly} htmlFor="pickup-search">픽업 번호</label>
                            <input id="pickup-search" value={query} onChange={e => setQuery(e.target.value)} inputMode="numeric" placeholder="픽업 번호 검색" />
                            <button type="submit" aria-label="검색"><Search size={18} /></button>
                            {searchNumber !== null && <button type="button" onClick={clearSearch}>초기화</button>}
                        </form>
                        <div className={styles.filters} aria-label="주문 상태 필터">{([
                            ["all", "전체"], ["unacknowledged", "미확인"], ...Object.entries(LABELS),
                        ] as [Filter, string][]).map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setSelectedId(null); }}>{label}</button>)}</div>
                        {isLoading || searching ? <p role="status" className={styles.empty}>주문을 불러오는 중입니다…</p> : visible.length === 0 ?
                            <p className={styles.empty}>{searchNumber !== null ? "해당 픽업 번호의 주문이 없습니다." : filter !== "all" ? "조건에 맞는 주문이 없습니다." : error ? "주문 목록을 확인할 수 없습니다." : "아직 주문이 없습니다."}</p> :
                            <ul className={styles.cards}>{visible.map(order => <li key={order.id}>
                                <button className={`${styles.card} ${isUnacknowledged(order) ? styles.unread : ""}`} aria-pressed={selectedId === order.id}
                                    onClick={() => setSelectedId(order.id)} aria-label={`픽업 ${pickup(order.pickupNumber)} 주문 상세`}>
                                    <div className={styles.cardTop}><strong>#{pickup(order.pickupNumber)}</strong><span className={styles.badge}>{LABELS[order.status]}</span></div>
                                    <p>{order.items.map(item => `${item.menuNameKo} × ${item.quantity}`).join(", ")}</p>
                                    <div className={styles.cardMeta}><span>{order.paymentMethod === "cash" ? "현금" : "계좌이체"} · {money(order.totalAmount)}</span><time>{time(order.createdAt)}</time></div>
                                    {isUnacknowledged(order) && <span className={styles.unreadLabel}>● 새 주문 · 미확인</span>}
                                    {order.transferReportedAt && <span className={styles.reported}>송금 신고됨</span>}
                                </button>
                            </li>)}</ul>}
                    </div>
                    <section className={styles.detail} aria-label="주문 상세">
                        {selected ? <>
                            <button className={styles.back} onClick={() => setSelectedId(null)}>목록으로</button>
                            <div className={styles.pickup}><span>픽업 번호</span><strong>#{pickup(selected.pickupNumber)}</strong><span>{LABELS[selected.status]}</span>
                                <HotteokMascot variant="wave" size={72} className={styles.pickupMascot} /></div>
                            <div className={styles.info}><div>주문 시각<strong>{time(selected.createdAt)}</strong></div><div>결제 수단<strong>{selected.paymentMethod === "cash" ? "현금" : "계좌이체"}</strong></div></div>
                            <div className={styles.items}><h2>주문 내역</h2>{selected.items.map((item, index) => <div key={index}>
                                <p><span>{item.menuNameKo} × {item.quantity}</span><strong>{money(item.lineTotal)}</strong></p>
                                {item.options.map((option, i) => <small key={i}>{option.nameKo} (+{money(option.extraPrice)})</small>)}
                            </div>)}<p className={styles.total}><span>합계</span><strong>{money(selected.totalAmount)}</strong></p></div>
                            {selected.transferReportedAt && <p className={styles.reported}>송금 신고됨 · {time(selected.transferReportedAt)}</p>}
                            {selected.cancelRequestedAt && !selected.cancelRejectedAt && <p className={styles.reported}>취소 요청됨 · {time(selected.cancelRequestedAt)}</p>}
                            {selected.lastReason && <p>처리 사유: {selected.lastReason}</p>}
                            {isUnacknowledged(selected) ? <div className={styles.confirm}><strong>새 주문 · 미확인</strong><p>주문 확인은 입금 확인과 별개의 처리입니다.</p>
                                <button onClick={() => acknowledge(selected)} disabled={pendingId !== null}>{pendingId === selected.id && pendingAction === null ? "확인 처리 중…" : "확인 처리"}</button></div> : <p className={styles.notice}>{selected.acknowledgedAt ? "확인한 주문입니다." : "처리가 종료된 주문입니다."}</p>}
                            <OrderActionButtons availableActions={selected.availableActions}
                                pendingAction={pendingId === selected.id ? pendingAction : null}
                                disabled={pendingId !== null}
                                error={transitionError?.id === selected.id ? transitionError.message : undefined}
                                onAction={action => transitionOrder(selected, action)} />
                            <OrderCancelRefund key={selected.id} paymentMethod={selected.paymentMethod}
                                availableActions={selected.availableActions}
                                pendingAction={pendingId === selected.id ? pendingAction : null}
                                disabled={pendingId !== null}
                                onAction={(action, input) => transitionOrder(selected, action, input)} />
                        </> : <div className={styles.empty}><HotteokMascot variant="heart" size={56} /><h2>주문을 선택해 주세요</h2><p>픽업 번호와 주문 내역을 확인할 수 있습니다.</p></div>}
                    </section>
                </section>
                </>}
            </div>
        </div>
    </div>;
}
