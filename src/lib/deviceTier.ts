// 보급형 기기 판별 — 축제 장식을 가볍게 그릴지 정한다(기능은 같고 장식만 줄어든다).
// 데이터 절약 모드, 메모리 4GB 이하(Chrome 계열만 알려 줌), 코어 2개 이하이면 가벼운 모드로 본다.
// iPhone(Safari)은 메모리를 알려 주지 않아 코어 수로만 판단되므로 대부분 일반 모드다.
type NavigatorHints = { deviceMemory?: number; hardwareConcurrency?: number; connection?: { saveData?: boolean } };

export function isLiteDevice(hints: NavigatorHints | undefined = typeof navigator === "undefined" ? undefined : (navigator as NavigatorHints)): boolean {
    if (!hints) return false;
    if (hints.connection?.saveData) return true;
    if (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) return true;
    return hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 2;
}
