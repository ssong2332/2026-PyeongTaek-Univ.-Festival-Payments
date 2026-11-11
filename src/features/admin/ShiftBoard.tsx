"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ClipboardPaste, Clock3, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { blockState, blocksOf, minutesUntil, nextBlock, parseRoster, withoutExisting, type ShiftBlock } from "@/domain/shift/roster";
import type { Shift, ShiftInput } from "@/domain/shift/schedule";
import { kstDate } from "@/domain/time/kst";

// 교대 스케줄 화면의 보기 부분 — 지금 근무 카드, 날짜별 타임라인, 단톡방 시간표 붙여넣기.
// 목록 편집(추가·수정·삭제)은 ShiftManagement의 폼과 표가 그대로 맡는다.

// 이름마다 같은 색 동그라미(이름 첫 글자) — 같은 사람이 여러 칸에 나와도 한눈에 찾게
const AVATAR_COLORS = ["#ffb547", "#ff8a6e", "#a6db86", "#7ec8ff", "#c9a4ff", "#ffd27a", "#ff9ecb", "#7fe0c8"];
function colorOf(name: string) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function PersonChip({ shift, big = false }: { shift: Shift; big?: boolean }) {
    const color = colorOf(shift.personName);
    const marked = shift.role.includes("✅");
    return (
        <li className={`flex items-center gap-1.5 rounded-full border border-iron-line bg-iron py-1 pr-3 pl-1 ${big ? "text-[15px]" : "text-sm"}`}>
            <span
                aria-hidden="true"
                className={`flex shrink-0 items-center justify-center rounded-full font-bold text-[#2a1508] ${big ? "size-8 text-sm" : "size-6 text-xs"}`}
                style={{ background: color, boxShadow: `0 0 10px ${color}66` }}
            >
                {shift.personName.slice(-2, -1) || shift.personName[0]}
            </span>
            <span className="font-semibold whitespace-nowrap text-dough">{shift.personName}</span>
            {marked && <span title={shift.role} className="text-xs">✅</span>}
        </li>
    );
}

const duration = (block: ShiftBlock) => {
    const [sh, sm] = block.startsAt.split(":").map(Number);
    const [eh, em] = block.endsAt.split(":").map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    return minutes % 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes / 60}시간`;
};
const dayLabel = (date: string) => {
    const [, m, d] = date.split("-").map(Number);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T12:00:00+09:00`).getUTCDay()];
    return `${m}월 ${d}일(${weekday})`;
};
const untilText = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`);

// 지금 근무 중인 사람들(겹치는 칸 모두) + 남은 시간 + 다음 교대
export function NowBoard({ shifts, now, loading, loaded }: { shifts: readonly Shift[]; now: Date; loading: boolean; loaded: boolean }) {
    const today = kstDate(now.toISOString());
    const next = nextBlock(shifts, now);
    const nowBlocks = blocksOf(shifts, today).filter((block) => blockState(block, now, null).state === "now");
    return (
        <section aria-labelledby="shift-current" className="relative overflow-hidden rounded-3xl border border-syrup/40 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,181,71,0.18),transparent_55%),linear-gradient(160deg,#2d2631,#1b171f)] p-5 shadow-[0_0_40px_rgba(255,160,60,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="shift-current" className="flex items-center gap-2 font-display text-xl text-dough">
                    <span className="relative flex size-2.5">
                        <span className="absolute inline-flex size-full rounded-full bg-ok opacity-70 motion-safe:animate-ping" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
                    </span>
                    현재 담당자
                </h2>
                <time className="font-num text-sm text-dough-dim" dateTime={now.toISOString()}>
                    {now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                </time>
            </div>

            {loading ? (
                <p role="status" className="mt-4 text-sm text-dough-dim">스케줄 불러오는 중…</p>
            ) : !loaded ? (
                <p className="mt-4 text-sm text-dough-dim">스케줄 조회가 필요합니다.</p>
            ) : nowBlocks.length ? (
                <div className="mt-4 grid gap-4">
                    {nowBlocks.map((block) => {
                        const { progress } = blockState(block, now, null);
                        const left = minutesUntil(block.date, block.endsAt, now);
                        return (
                            <div key={block.key}>
                                <div className="flex flex-wrap items-end justify-between gap-2">
                                    <p className="font-num text-3xl text-syrup">
                                        {block.startsAt}
                                        <span className="mx-1 text-dough-dim">–</span>
                                        {block.endsAt}
                                    </p>
                                    <p className="rounded-full bg-syrup/15 px-3 py-1 text-sm font-bold text-syrup">교대까지 {untilText(left)}</p>
                                </div>
                                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-iron">
                                    <motion.div
                                        className="h-full rounded-full bg-linear-to-r from-caramel via-syrup to-[#ffe2a6] shadow-[0_0_12px_rgba(255,181,71,0.8)]"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.round(progress * 100)}%` }}
                                        transition={{ duration: 1, ease: [0.3, 0, 0.2, 1] }}
                                    />
                                </div>
                                <ul className="mt-3 flex flex-wrap gap-2">
                                    {block.people.map((person) => (
                                        <PersonChip key={person.id} shift={person} big />
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="mt-4 text-sm text-dough-dim">현재 담당자 없음</p>
            )}

            {loaded && next && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-iron-line pt-3 text-sm text-dough-dim">
                    <CalendarClock size={16} className="text-syrup" aria-hidden="true" />
                    <span>
                        다음 교대 <b className="text-dough">{next.date === today ? "" : `${dayLabel(next.date)} `}{next.startsAt}</b> · {untilText(minutesUntil(next.date, next.startsAt, now))} 뒤 ·{" "}
                        {next.people.map((person) => person.personName).join(", ")}
                    </span>
                </div>
            )}
        </section>
    );
}

// 날짜 탭 + 시간대 칸 타임라인. 지난 칸은 흐리게, 지금 칸은 빛나며 진행 막대가 차오르고, 다음 칸은 '다음' 표시.
export function ShiftTimeline({ shifts, now }: { shifts: readonly Shift[]; now: Date }) {
    const dates = useMemo(() => [...new Set(shifts.map((shift) => shift.date))].sort(), [shifts]);
    const today = kstDate(now.toISOString());
    const [picked, setPicked] = useState<string | null>(null);
    const date = picked && dates.includes(picked) ? picked : dates.includes(today) ? today : dates[0];
    if (!date) return null;
    const blocks = blocksOf(shifts, date);
    const nextKey = nextBlock(shifts, now)?.key ?? null;

    return (
        <section aria-labelledby="shift-timeline" className="rounded-3xl border border-iron-line bg-iron-2 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="shift-timeline" className="flex items-center gap-2 font-display text-xl text-dough">
                    <Clock3 size={20} className="text-syrup" aria-hidden="true" />
                    근무 시간표
                </h2>
                <div role="tablist" aria-label="날짜" className="flex gap-1 rounded-full border border-iron-line bg-iron p-1">
                    {dates.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={value === date}
                            onClick={() => setPicked(value)}
                            className={`relative rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${value === date ? "text-molasses" : "text-dough-dim hover:text-dough"}`}
                        >
                            {value === date && <motion.span layoutId="shift-day-pill" className="absolute inset-0 rounded-full bg-syrup" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                            <span className="relative">{dayLabel(value)}{value === today ? " · 오늘" : ""}</span>
                        </button>
                    ))}
                </div>
            </div>

            <ol className="relative mt-5 grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-0.5 before:rounded-full before:bg-iron-line">
                <AnimatePresence mode="popLayout" initial={false}>
                    {blocks.map((block, index) => {
                        const { state, progress } = blockState(block, now, nextKey);
                        return (
                            <motion.li
                                key={block.key}
                                layout
                                initial={{ opacity: 0, x: -14 }}
                                animate={{ opacity: state === "past" ? 0.5 : 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ type: "spring", stiffness: 320, damping: 28, delay: index * 0.04 }}
                                className="relative grid grid-cols-[40px_1fr] gap-3"
                            >
                                <span aria-hidden="true" className="relative z-10 flex justify-center pt-3">
                                    <span
                                        className={`flex size-4 items-center justify-center rounded-full border-2 ${
                                            state === "now" ? "border-syrup bg-syrup shadow-[0_0_14px_rgba(255,181,71,0.9)]" : state === "next" ? "border-syrup bg-iron-2" : state === "past" ? "border-iron-line bg-iron-line" : "border-iron-line bg-iron-2"
                                        }`}
                                    >
                                        {state === "now" && <span className="size-4 rounded-full border-2 border-syrup motion-safe:animate-ping" />}
                                    </span>
                                </span>
                                <div
                                    className={`relative overflow-hidden rounded-2xl border p-4 ${
                                        state === "now" ? "border-syrup/70 bg-[linear-gradient(120deg,rgba(255,181,71,0.16),rgba(33,28,37,0.9)_60%)] shadow-[0_0_28px_rgba(255,170,60,0.22)]" : "border-iron-line bg-iron"
                                    }`}
                                >
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <p className={`font-num text-lg ${state === "now" ? "text-syrup" : "text-dough"}`}>
                                            {block.startsAt}–{block.endsAt}
                                        </p>
                                        <span className="text-xs text-dough-dim">{duration(block)}</span>
                                        <span className="flex items-center gap-1 text-xs text-dough-dim">
                                            <Users size={13} aria-hidden="true" />
                                            {block.people.length}명
                                        </span>
                                        {state === "now" && <span className="ml-auto rounded-full bg-syrup px-2.5 py-0.5 text-xs font-bold text-molasses">지금</span>}
                                        {state === "next" && <span className="ml-auto rounded-full border border-syrup/60 px-2.5 py-0.5 text-xs font-bold text-syrup">다음 · {untilText(minutesUntil(block.date, block.startsAt, now))} 뒤</span>}
                                        {state === "past" && <span className="ml-auto text-xs text-dough-dim">끝남</span>}
                                    </div>
                                    <ul className="mt-3 flex flex-wrap gap-1.5">
                                        {block.people.map((person) => (
                                            <PersonChip key={person.id} shift={person} />
                                        ))}
                                    </ul>
                                    {state === "now" && (
                                        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-iron">
                                            <span className="block h-full bg-linear-to-r from-caramel to-syrup" style={{ width: `${Math.round(progress * 100)}%` }} />
                                        </span>
                                    )}
                                </div>
                            </motion.li>
                        );
                    })}
                </AnimatePresence>
            </ol>
        </section>
    );
}

// 단톡방 시간표 글을 붙여 넣어 한 번에 등록. 미리보기에서 날짜·시간대별 인원과 건너뛴 줄을 보여 주고,
// 이미 등록된 근무(같은 날짜·시간대·이름)는 빼고 등록한다.
export function RosterImport({
    shifts,
    now,
    disabled,
    onImport,
}: {
    shifts: readonly Shift[];
    now: Date;
    disabled: boolean;
    onImport: (inputs: ShiftInput[], onProgress: (done: number) => void) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [role, setRole] = useState("부스 근무");
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const year = Number(kstDate(now.toISOString()).slice(0, 4));
    const parsed = useMemo(() => parseRoster(text, year, role.trim() || "부스 근무"), [text, year, role]);
    const fresh = withoutExisting(parsed.inputs, shifts);
    const duplicates = parsed.inputs.length - fresh.length;
    const groups = useMemo(() => {
        const map = new Map<string, number>();
        for (const input of fresh) map.set(`${input.date} ${input.startsAt}–${input.endsAt}`, (map.get(`${input.date} ${input.startsAt}–${input.endsAt}`) ?? 0) + 1);
        return [...map.entries()];
    }, [fresh]);
    const busy = progress !== null;

    async function submit() {
        if (!fresh.length || busy) return;
        setProgress({ done: 0, total: fresh.length });
        try {
            await onImport(fresh, (done) => setProgress({ done, total: fresh.length }));
            setText("");
        } finally {
            setProgress(null);
        }
    }

    return (
        <section aria-labelledby="roster-import" className="rounded-3xl border border-dashed border-syrup/45 bg-iron-2 p-5">
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 text-left">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-syrup/15 text-syrup">
                    <ClipboardPaste size={20} aria-hidden="true" />
                </span>
                <span className="flex-1">
                    <span id="roster-import" className="block font-display text-lg text-dough">시간표 붙여넣기로 한 번에 등록</span>
                    <span className="block text-xs text-dough-dim">단톡방 시간표 글(📅 날짜 · 09:00 ~ 10:00 · 이름 / 이름)을 그대로 붙여 넣으세요</span>
                </span>
                <span aria-hidden="true" className={`text-syrup transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-4 grid gap-3">
                            <label className="grid gap-1.5 text-sm font-medium text-dough-dim" htmlFor="roster-text">
                                시간표 글
                                <textarea
                                    id="roster-text"
                                    value={text}
                                    disabled={disabled || busy}
                                    onChange={(event) => setText(event.target.value)}
                                    rows={9}
                                    placeholder={"📅 10월 7일(수)\n09:00 ~ 10:00\n홍길동 / 김철수 / ✅이영희"}
                                    className="rounded-xl border border-iron-line bg-iron px-3 py-2.5 font-mono text-sm text-dough outline-none focus:ring-2 focus:ring-syrup disabled:opacity-60"
                                />
                            </label>
                            <label className="grid max-w-xs gap-1.5 text-sm font-medium text-dough-dim" htmlFor="roster-role">
                                붙여넣기 역할 이름
                                <input
                                    id="roster-role"
                                    value={role}
                                    disabled={disabled || busy}
                                    maxLength={90}
                                    onChange={(event) => setRole(event.target.value)}
                                    className="rounded-lg border border-iron-line bg-iron px-3 py-2 text-dough outline-none focus:ring-2 focus:ring-syrup"
                                />
                            </label>

                            {text.trim() && (
                                <div className="grid gap-2 rounded-2xl border border-iron-line bg-iron p-4 text-sm">
                                    <p className="flex items-center gap-2 font-bold text-dough">
                                        <Sparkles size={16} className="text-syrup" aria-hidden="true" />
                                        새로 등록 {fresh.length}건{duplicates > 0 && <span className="font-normal text-dough-dim"> · 이미 있는 {duplicates}건 제외</span>}
                                    </p>
                                    {groups.length > 0 && (
                                        <ul className="flex flex-wrap gap-1.5">
                                            {groups.map(([label, count]) => (
                                                <li key={label} className="rounded-full bg-iron-2 px-2.5 py-1 text-xs text-dough">
                                                    {label} · {count}명
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {parsed.skipped.length > 0 && (
                                        <ul className="grid gap-0.5 text-xs text-dough-dim">
                                            {parsed.skipped.map((reason) => (
                                                <li key={reason}>· {reason}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    disabled={disabled || busy || fresh.length === 0}
                                    onClick={() => void submit()}
                                    className="rounded-xl bg-linear-to-r from-[#ffd58a] via-syrup to-[#f08a2c] px-5 py-2.5 text-sm font-extrabold text-molasses shadow-[0_8px_20px_rgba(240,138,44,0.3)] disabled:opacity-45"
                                >
                                    {busy ? `등록 중… ${progress.done}/${progress.total}` : `${fresh.length}건 한 번에 등록`}
                                </button>
                                {busy && (
                                    <span aria-hidden="true" className="h-2 w-40 overflow-hidden rounded-full bg-iron">
                                        <span className="block h-full rounded-full bg-syrup transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                                    </span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
