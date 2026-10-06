"use client";

import { LayoutGroup, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BarChart3, Bell, CheckCircle, ClipboardList, Clock, Flame, LayoutDashboard, Search, Settings2, UtensilsCrossed, XCircle } from "lucide-react";
import { sharedLayoutId } from "@/components/motion/presets";
import { RollingNumber } from "@/components/motion/RollingNumber";
import type { AdminOrderDto, OrderStatus, TransitionAction } from "@/lib/dto/adminOrder";
import type { StatsDto } from "@/lib/dto/stats";
import { StatsPanel } from "./StatsPanel";
import { OrderActionButtons } from "./OrderActionButtons";
import { OrderCancelRefund, type CancelRefundInput } from "./OrderCancelRefund";
import { CancelRequestDecision, type CancelRequestDecisionKind } from "./CancelRequestDecision";
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
const manualNumber = (value: number) => `M-${String(value).padStart(3, "0")}`;
const orderNumber = (order: AdminOrderDto) =>
    order.source === "manual" && order.manualNumber ? manualNumber(order.manualNumber) : `#${pickup(order.pickupNumber)}`;
const orderTime = (order: AdminOrderDto) =>
    order.source === "manual" && order.manualOrderedAt ? order.manualOrderedAt : order.createdAt;
// 주문표의 짧은 시각(KST HH:MM)
const clockOf = (value: string) => new Date(value).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

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
    // T-20 메뉴·재고 관리 화면. 없으면 탭을 숨긴다.
    menuPanel?: ReactNode;
    // T-35 고객 취소 요청 승인·거절. 없으면(미리보기 등) 요청 표시만 한다.
    onCancelRequestDecision?: (id: string, decision: CancelRequestDecisionKind, reason: string) => Promise<void>;
}

export function OrderDashboard({ orders, isLoading = false, error, preview = false,
    onReload, onAcknowledge, onSearch, onLoadStats, onTransition, settingsPanel, menuPanel, onCancelRequestDecision }: OrderDashboardProps) {
    const [page, setPage] = useState<"dashboard" | "orders" | "menus" | "stats" | "settings">("dashboard");
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
    const now = useNow(1000);
    const unacknowledged = orders.filter(isUnacknowledged).length;
    const newOrderFlash = useIncreaseKey(unacknowledged);
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

    const columns = COLUMNS.map(column => ({ ...column, orders: visible.filter(order => column.statuses.includes(order.status)) }));
    const pageTitle = page === "dashboard" ? "대시보드" : page === "stats" ? "매출 통계" : page === "settings" ? "운영 설정" : page === "menus" ? "메뉴·재고" : "주문 관리";

    return <div className={styles.shell}>
        {/* 새 주문이 들어오면(미확인 수 증가) 화면 위 가장자리로 시럽빛 섬광이 훑고 지나간다 */}
        {newOrderFlash > 0 && <motion.div key={newOrderFlash} aria-hidden="true" className={styles.newOrderFlash}
            initial={{ opacity: 0, scaleX: 0.2 }} animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1] }} transition={{ duration: 1.4, ease: "easeOut" }} />}
        {/* 머리: 로고 · 화면 탭(시럽색 알약이 미끄러짐) · 실시간 상태 · 시계 */}
        <header className={styles.topbar}>
            <div className={styles.brand}>
                <span className={styles.brandMark}><Flame size={20} /></span>
                <span><small>2026 평택대학교 대동제</small><b>호떡 부스 운영</b></span>
            </div>
            <nav aria-label="관리자 메뉴" className={styles.tabs}>
                {([
                    ["dashboard", "대시보드", LayoutDashboard], ["orders", "주문 관리", ClipboardList],
                    ...(menuPanel ? [["menus", "메뉴·재고", UtensilsCrossed] as const] : []),
                    ["stats", "매출 통계", BarChart3],
                    ...(settingsPanel ? [["settings", "운영 설정", Settings2] as const] : []),
                ] as const).map(([id, label, Icon]) => <button key={id} type="button" aria-current={page === id ? "page" : undefined}
                    onClick={() => { setPage(id); if (id !== "settings" && id !== "menus") { setFilter("all"); clearSearch(); } }}>
                    {page === id && <motion.span layoutId={sharedLayoutId("admin-tab")} className={styles.tabPill} transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                    <Icon size={16} /><span>{label}</span>
                    {id === "orders" && unacknowledged > 0 && <span className={styles.tabCount}>{unacknowledged}</span>}
                </button>)}
            </nav>
            <div className={styles.live}>
                <span className={styles.liveDot} /> 실시간 <Clock3Text />
                {page !== "stats" && page !== "settings" && page !== "menus" && <button type="button" onClick={reload} disabled={isLoading} className={styles.refresh}>새로고침</button>}
            </div>
        </header>
        {preview && <div className={styles.preview}>목업 미리보기 · 실제 주문과 연결되지 않습니다.</div>}

        <div className={styles.content}>
            {page === "stats" ? <StatsPanel loadStats={onLoadStats} initialDate={preview ? "all" : undefined} /> : page === "settings" ? settingsPanel : page === "menus" ? menuPanel : <>
                <div className={styles.heading}>
                    <div>
                        <p className={styles.eyebrow}>{pageTitle}</p>
                        <h1>{page === "dashboard" ? "호떡 운영 대시보드" : "현장 주문판"}</h1>
                    </div>
                    <form className={styles.search} onSubmit={search}>
                        <label className={styles.srOnly} htmlFor="pickup-search">픽업 번호</label>
                        <Search size={16} aria-hidden="true" />
                        <input id="pickup-search" value={query} onChange={e => setQuery(e.target.value)} inputMode="numeric" placeholder="픽업 번호 검색" />
                        <button type="submit" aria-label="검색"><ArrowRight size={16} /></button>
                        {searchNumber !== null && <button type="button" onClick={clearSearch} className={styles.reset}>초기화</button>}
                    </form>
                </div>
                <p role="status" className={styles.notice}>{notice || `미확인 주문 ${unacknowledged}건`}</p>
                {(error || actionError) && <div role="alert" className={styles.error}>{actionError || "주문을 불러오지 못했습니다. 새로고침해 주세요."}</div>}

                {page === "dashboard" && <section className={styles.stats} aria-label="오늘 주문 요약">
                    {stats.map((s, index) => <motion.button key={s.label} type="button" className={styles.stat} data-tone={s.filter}
                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, type: "spring", stiffness: 320, damping: 26 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => { setPage("orders"); setFilter(s.filter); clearSearch(); }}>
                        <span className={styles.statLabel}><s.icon size={15} />{s.label}</span>
                        <strong>{isLoading ? "—" : <RollingNumber value={String(s.value)} />}</strong>
                    </motion.button>)}
                </section>}

                <section className={`${styles.board} ${selected ? styles.hasSelection : ""}`} aria-label="주문 목록과 상세">
                    <div className={styles.rail}>
                        <div className={styles.railHead}>
                            <h2>{searchNumber === null ? "오늘 주문" : `픽업 #${pickup(searchNumber)} 검색 결과`}</h2>
                            <span className={styles.unreadChip} data-active={unacknowledged > 0 || undefined}><Bell size={13} />{`미확인 주문 ${unacknowledged}건`}</span>
                            <div className={styles.filters} aria-label="주문 상태 필터">{([
                                ["all", "전체"], ["unacknowledged", "미확인"], ...Object.entries(LABELS),
                            ] as [Filter, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setSelectedId(null); }}>{label}</button>)}</div>
                        </div>
                        {isLoading || searching ? <p role="status" className={styles.empty}>주문을 불러오는 중입니다…</p> : visible.length === 0 ?
                            <p className={styles.empty}>{searchNumber !== null ? "해당 픽업 번호의 주문이 없습니다." : filter !== "all" ? "조건에 맞는 주문이 없습니다." : error ? "주문 목록을 확인할 수 없습니다." : "아직 주문이 없습니다."}</p> :
                            <LayoutGroup>
                                <div className={styles.columns}>{columns.map(column => <div key={column.id} className={styles.column} data-column={column.id}>
                                    <div className={styles.columnHead}><b>{column.title}</b><span className={styles.columnCount}>{column.orders.length}</span><small>{column.hint}</small></div>
                                    {/* 주문표를 매다는 레일(장식) */}
                                    <span aria-hidden="true" className={styles.railBar} />
                                    <ul className={styles.cards}>
                                        {column.orders.length === 0 && <li className={styles.columnEmpty}>비어 있음</li>}
                                        {column.orders.map(order => <motion.li key={order.id} layout layoutId={sharedLayoutId(`ticket-${order.id}`)}
                                            initial={{ opacity: 0, y: -36, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 24 }}>
                                            <Ticket order={order} now={now} selected={selectedId === order.id} onSelect={() => setSelectedId(order.id)} />
                                        </motion.li>)}
                                    </ul>
                                </div>)}</div>
                            </LayoutGroup>}
                    </div>

                    <section className={styles.detail} aria-label="주문 상세">
                        {selected ? <motion.div key={selected.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
                            <button type="button" className={styles.back} onClick={() => setSelectedId(null)}>목록으로</button>
                            <div className={styles.pickup}>
                                <span>{selected.source === "manual" ? "수기 번호" : "픽업 번호"}</span>
                                <strong>{orderNumber(selected)}</strong>
                                <span className={styles.pickupStatus} data-status={selected.status}>{LABELS[selected.status]}</span>
                            </div>
                            <div className={styles.info}><div>주문 시각<strong>{time(orderTime(selected))}</strong></div><div>결제 수단<strong>{selected.paymentMethod === "cash" ? "현금" : "계좌이체"}</strong></div></div>
                            <div className={styles.items}><h2>주문 내역</h2>{selected.items.map((item, index) => <div key={index}>
                                <p><span>{item.menuNameKo} × {item.quantity}</span><strong>{money(item.lineTotal)}</strong></p>
                                {item.options.map((option, i) => <small key={i}>{option.nameKo} (+{money(option.extraPrice)})</small>)}
                            </div>)}<p className={styles.total}><span>합계</span><strong>{money(selected.totalAmount)}</strong></p></div>
                            {selected.transferReportedAt && <p className={styles.reported}>송금 신고됨 · {time(selected.transferReportedAt)}</p>}
                            {selected.cancelRequestedAt && !selected.cancelRejectedAt && <p className={styles.reported}>취소 요청됨 · {time(selected.cancelRequestedAt)}</p>}
                            {selected.cancelRequestedAt && !selected.cancelRejectedAt && onCancelRequestDecision
                                && (selected.status === "pending" || selected.status === "paid")
                                && <CancelRequestDecision key={`cr-${selected.id}`} requestedAtLabel={time(selected.cancelRequestedAt)}
                                    disabled={pendingId !== null}
                                    onDecide={async (decision, reason) => {
                                        await onCancelRequestDecision(selected.id, decision, reason);
                                        setNotice(`픽업 #${pickup(selected.pickupNumber)} 취소 요청을 ${decision === "approve" ? "승인" : "거절"}했습니다.`);
                                    }} />}
                            {selected.lastReason && <p className={styles.reason}>처리 사유: {selected.lastReason}</p>}
                            {isUnacknowledged(selected) ? <div className={styles.confirm}><strong>새 주문 · 미확인</strong><p>주문 확인은 입금 확인과 별개의 처리입니다.</p>
                                <button type="button" onClick={() => acknowledge(selected)} disabled={pendingId !== null}>{pendingId === selected.id && pendingAction === null ? "확인 처리 중…" : "확인 처리"}</button></div> : <p className={styles.notice}>{selected.acknowledgedAt ? "확인한 주문입니다." : "처리가 종료된 주문입니다."}</p>}
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
                        </motion.div> : <div className={styles.detailEmpty}>
                            <span className={styles.detailEmptyIcon}><ClipboardList size={26} /></span>
                            <h2>주문을 선택해 주세요</h2><p>주문표를 누르면 픽업 번호와 주문 내역, 처리 버튼이 여기에 나와요.</p>
                        </div>}
                    </section>
                </section>
            </>}
        </div>
    </div>;
}

// 레일 칸: 결제대기 → 조리(결제확인·조리중) → 완료 → 종료. 상태가 바뀌면 주문표가 옆 칸으로 날아가 옮겨 붙는다(layoutId).
const COLUMNS: readonly { id: string; title: string; hint: string; statuses: readonly OrderStatus[] }[] = [
    { id: "pending", title: "결제대기", hint: "현금·입금 확인 전 · 10분 뒤 만료", statuses: ["pending"] },
    { id: "cooking", title: "조리", hint: "결제확인 · 철판 위", statuses: ["paid", "cooking"] },
    { id: "completed", title: "완료", hint: "수령 안내", statuses: ["completed"] },
    { id: "closed", title: "종료", hint: "취소·환불·만료", statuses: ["cancelled", "refunded", "expired"] },
];
const EXPIRE_MS = 10 * 60 * 1000;
const STAMP: Partial<Record<OrderStatus, string>> = { completed: "완료", cancelled: "취소", refunded: "환불", expired: "만료" };

// 값이 커질 때마다 1씩 늘어나는 키(새 주문 섬광을 다시 재생하는 데 쓴다). 처음 값은 세지 않는다.
function useIncreaseKey(value: number) {
    const previous = useRef(value);
    const [key, setKey] = useState(0);
    useEffect(() => {
        if (value > previous.current) {
            // 외부 데이터(실시간 주문)가 늘어난 순간 한 번 반응한다.
            setKey((current) => current + 1);
            try {
                navigator.vibrate?.([40, 60, 40]);
            } catch {
                // 진동이 없어도 화면 연출은 그대로다.
            }
        }
        previous.current = value;
    }, [value]);
    return key;
}

// 1초마다 바뀌는 지금 시각(만료 막대·"N분 전"용)
function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
}

function Clock3Text() {
    const now = useNow(1000);
    const kst = new Date(now + 9 * 3600 * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return <span className={styles.clock}>{`${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`}</span>;
}

// 반죽색 종이 주문표: 집게 · 큰 픽업 번호 · 몇 분 전 · 메뉴 · 결제 · (결제대기면) 만료 막대 · (끝났으면) 도장
function Ticket({ order, now, selected, onSelect }: { order: AdminOrderDto; now: number; selected: boolean; onSelect: () => void }) {
    const minutesAgo = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000));
    const left = EXPIRE_MS - (now - new Date(order.createdAt).getTime());
    const stamp = STAMP[order.status];
    const unread = isUnacknowledged(order);
    return <button type="button" className={`${styles.card} ${unread ? styles.unread : ""}`} aria-pressed={selected}
        onClick={onSelect} aria-label={`${order.source === "manual" ? "수기" : "픽업"} ${orderNumber(order)} 주문 상세`} data-status={order.status}>
        <span aria-hidden="true" className={styles.clip} />
        <div className={styles.cardTop}><strong>{orderNumber(order)}</strong><span className={styles.ago}>{minutesAgo < 60 ? `${minutesAgo}분 전` : clockOf(orderTime(order))}</span></div>
        <ul className={styles.lines}>{order.items.map((item, index) => <li key={index}><span>{item.menuNameKo}</span><span>×{item.quantity}</span></li>)}</ul>
        <div className={styles.cardMeta}><span>{order.source === "manual" ? "수기 입력 · " : ""}{order.paymentMethod === "cash" ? "현금" : "계좌이체"} · {money(order.totalAmount)}</span><span className={styles.badge}>{LABELS[order.status]}</span></div>
        {order.status === "pending" && left > 0 && <span className={styles.expiry} data-urgent={left < 2 * 60 * 1000 || undefined}>
            <span className={styles.expiryTrack}><span className={styles.expiryFill} style={{ width: `${(left / EXPIRE_MS) * 100}%` }} /></span>
            <span>만료까지 {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}</span>
        </span>}
        {unread && <span className={styles.unreadLabel}>● 새 주문 · 미확인</span>}
        {order.transferReportedAt && <span className={styles.reported}>송금 신고됨</span>}
        {order.cancelRequestedAt && !order.cancelRejectedAt && <span className={styles.reported}>취소 요청</span>}
        {stamp && <motion.span aria-hidden="true" className={styles.stamp} data-status={order.status}
            initial={{ scale: 2.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: -12 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}>{stamp}</motion.span>}
    </button>;
}
