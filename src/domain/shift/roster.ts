import type { Shift, ShiftInput } from "./schedule";

// 단톡방에 올리는 근무 시간표 글을 그대로 붙여 넣어 사람별 근무(ShiftInput)로 바꾼다.
// 알아듣는 줄:
//   "📅 10월 7일(수)"            → 날짜(연도는 기준 연도)
//   "09:00 ~ 10:00"             → 시간대(~, -, – 모두 가능). 같은 줄 뒤에 이름이 이어져도 된다
//   "김희진 / 박수홍 / ✅김정우"   → 이름(/ 또는 , 로 구분). ✅ 표시가 붙은 사람은 역할 끝에 ✅를 붙인다
// "시간", "인원" 같은 표 머리와 이름 없는 시간대(예: "19:00" + "마무리 — 다 같이")는 건너뛰고 skipped에 남긴다.
export type RosterParseResult = { inputs: ShiftInput[]; skipped: string[] };

const DATE_RE = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const RANGE_RE = /(\d{1,2}):(\d{2})\s*[~\-–—]\s*(\d{1,2}):(\d{2})/;
const LONE_TIME_RE = /^(\d{1,2}):(\d{2})$/;
const SEPARATOR_RE = /[/,，、]/;
const HEADER_WORDS = new Set(["시간", "인원", "이름", "담당"]);
const NOT_NAMES = new Set(["다같이", "다 같이", "전원", "마무리"]);
const SINGLE_NAME_RE = /^✅?[가-힣A-Za-z]{2,10}$/;
const MARK = "✅";

const two = (value: string | number) => String(value).padStart(2, "0");

function splitNames(text: string): string[] {
    return text
        .split(SEPARATOR_RE)
        .map((name) => name.replace(/\s+/g, " ").trim())
        .filter((name) => name.length > 0 && !NOT_NAMES.has(name));
}

export function parseRoster(text: string, year: number, role = "부스 근무"): RosterParseResult {
    const inputs: ShiftInput[] = [];
    const skipped: string[] = [];
    let date: string | null = null;
    let range: { startsAt: string; endsAt: string } | null = null;
    let rangeHasNames = false;
    let note: string | null = null; // 끝 시각 없는 시간(예: "19:00") — 다음 설명 줄과 함께 건너뜀으로 남긴다

    const where = () => date ?? "날짜 없음";
    const flush = () => {
        if (range && !rangeHasNames) skipped.push(`${where()} ${range.startsAt}~${range.endsAt} — 이름이 없어 건너뜀`);
        if (note) skipped.push(`${where()} ${note} — 끝 시각·이름이 없어 건너뜀`);
        range = null;
        rangeHasNames = false;
        note = null;
    };
    const addNames = (names: string[]) => {
        if (!date || !range) {
            skipped.push(`"${names.join(" / ")}" — 날짜·시간대보다 앞에 있어 건너뜀`);
            return;
        }
        for (const name of names) {
            const personName = name.replaceAll(MARK, "").trim();
            if (!personName) continue;
            inputs.push({ personName, date, startsAt: range.startsAt, endsAt: range.endsAt, role: name.includes(MARK) ? `${role} ${MARK}` : role });
            rangeHasNames = true;
        }
    };

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/\s+/g, " ").trim();
        if (!line || HEADER_WORDS.has(line)) continue;

        const dateMatch = line.match(DATE_RE);
        if (dateMatch) {
            flush();
            date = `${year}-${two(dateMatch[1])}-${two(dateMatch[2])}`;
            continue;
        }
        const rangeMatch = line.match(RANGE_RE);
        if (rangeMatch) {
            flush();
            range = { startsAt: `${two(rangeMatch[1])}:${rangeMatch[2]}`, endsAt: `${two(rangeMatch[3])}:${rangeMatch[4]}` };
            const rest = line.slice((rangeMatch.index ?? 0) + rangeMatch[0].length).trim();
            if (rest) addNames(splitNames(rest));
            continue;
        }
        const lone = line.match(LONE_TIME_RE);
        if (lone) {
            flush();
            note = `${two(lone[1])}:${lone[2]}`;
            continue;
        }
        if (SEPARATOR_RE.test(line) || (range && SINGLE_NAME_RE.test(line) && !NOT_NAMES.has(line))) {
            addNames(splitNames(line));
            continue;
        }
        // 이름으로 읽을 수 없는 설명 줄(예: "마무리 — 다 같이")
        skipped.push(`${where()} ${note ? `${note} ` : ""}"${line}" — 이름이 없어 건너뜀`);
        note = null;
    }
    flush();
    return { inputs, skipped };
}

const keyOf = (shift: ShiftInput) => `${shift.date}|${shift.startsAt}|${shift.endsAt}|${shift.personName}`;

// 이미 등록된 근무(같은 날짜·시간대·이름)와 붙여 넣은 글 안의 중복은 다시 넣지 않는다.
export function withoutExisting(inputs: readonly ShiftInput[], existing: readonly ShiftInput[]): ShiftInput[] {
    const seen = new Set(existing.map(keyOf));
    return inputs.filter((input) => {
        const key = keyOf(input);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// 타임라인 한 칸: 같은 날짜·같은 시간대 사람들을 묶는다.
export type ShiftBlock = { key: string; date: string; startsAt: string; endsAt: string; people: Shift[] };

export function blocksOf(shifts: readonly Shift[], date: string): ShiftBlock[] {
    const blocks = new Map<string, ShiftBlock>();
    for (const shift of shifts) {
        if (shift.date !== date) continue;
        const key = `${shift.date}|${shift.startsAt}-${shift.endsAt}`;
        const block = blocks.get(key) ?? { key, date, startsAt: shift.startsAt, endsAt: shift.endsAt, people: [] };
        block.people.push(shift);
        blocks.set(key, block);
    }
    return [...blocks.values()]
        .map((block) => ({ ...block, people: [...block.people].sort((a, b) => a.personName.localeCompare(b.personName, "ko")) }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt));
}

export type BlockState = "past" | "now" | "next" | "later";

const at = (date: string, time: string) => Date.parse(`${date}T${time}:00+09:00`);

// 지금 시각 기준 칸의 상태와, 지금 칸의 진행률(0~1)
export function blockState(block: ShiftBlock, now: Date, nextKey: string | null): { state: BlockState; progress: number } {
    const instant = now.getTime();
    const start = at(block.date, block.startsAt);
    const end = at(block.date, block.endsAt);
    if (instant >= end) return { state: "past", progress: 1 };
    if (instant >= start) return { state: "now", progress: (instant - start) / (end - start) };
    return { state: block.key === nextKey ? "next" : "later", progress: 0 };
}

// 아직 시작하지 않은 가장 이른 칸(모든 날짜 중)
export function nextBlock(shifts: readonly Shift[], now: Date): ShiftBlock | null {
    const dates = [...new Set(shifts.map((shift) => shift.date))];
    const instant = now.getTime();
    return dates
        .flatMap((date) => blocksOf(shifts, date))
        .filter((block) => at(block.date, block.startsAt) > instant)
        .sort((a, b) => at(a.date, a.startsAt) - at(b.date, b.startsAt))[0] ?? null;
}

export function minutesUntil(date: string, time: string, now: Date): number {
    return Math.max(0, Math.ceil((at(date, time) - now.getTime()) / 60_000));
}
