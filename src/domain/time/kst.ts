// KST(UTC+9, 서머타임 없음) 날짜 계산. 런타임(Cloudflare Workers)은 UTC이므로 로컬 시간대에 기대지 않는다.
const kstOffsetMs = 9 * 60 * 60 * 1000;

// 시각(ISO 문자열) → 그 시각의 KST 날짜 'YYYY-MM-DD'.
export function kstDate(instant: string): string {
    const timestamp = Date.parse(instant);
    if (!Number.isFinite(timestamp)) throw new RangeError(`Invalid timestamp: ${instant}`);
    return new Date(timestamp + kstOffsetMs).toISOString().slice(0, 10);
}

// KST 날짜 'YYYY-MM-DD' → 그 하루의 UTC 범위 [start, end). 형식·달력이 틀리면 RangeError.
export function kstDayUtcRange(date: string): { start: string; end: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new RangeError("date must be YYYY-MM-DD");
    }
    const [year, month, day] = date.split("-").map(Number);
    const calendarDate = new Date(0);
    calendarDate.setUTCFullYear(year, month - 1, day);
    calendarDate.setUTCHours(0, 0, 0, 0);
    if (calendarDate.toISOString().slice(0, 10) !== date) {
        throw new RangeError("date must be a valid calendar day");
    }
    const start = calendarDate.getTime() - kstOffsetMs;
    return { start: new Date(start).toISOString(), end: new Date(start + 24 * 60 * 60 * 1000).toISOString() };
}
