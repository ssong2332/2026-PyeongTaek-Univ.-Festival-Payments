// 오프셋이 붙은 시각 문자열 → ISO 8601 UTC 밀리초 문자열(…Z). API 응답 시각 표기를 POST /api/orders와 맞춘다.
// 오프셋이 없으면 로컬 시간대로 해석되므로 받지 않는다. 밀리초 아래는 버린다(반올림하면 날짜가 넘어갈 수 있다).
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function toUtcIsoString(instant: string): string;
export function toUtcIsoString(instant: string | null): string | null;
export function toUtcIsoString(instant: string | null): string | null {
    if (instant === null) return null;
    const timestamp = Date.parse(instant);
    if (!EXPLICIT_OFFSET.test(instant) || !Number.isFinite(timestamp)) {
        throw new RangeError(`Invalid timestamp: ${instant}`);
    }
    return new Date(timestamp).toISOString();
}
