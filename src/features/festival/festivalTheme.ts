// 시간대에 따라 바뀌는 축제 분위기(고객 화면). 휴대폰의 실제 현재 시각(new Date())을 읽어 색이 연속으로 섞인다.
// 07:30 아침(흰·크림·연한 피치) → 10:30 오전(크림+연한 주황) → 12:00 낮(주황) → 14:30 오후(붉은 주황, 축제 이펙트 등장)
// → 16:00 어두운 하늘+주황 지평선 → 17:00 축제 최고조 → 18:00 축제 끝(어두워짐) → 22:00 야간(지금의 검정+시럽 UI, 새벽까지 유지).
// 사용자가 시간을 고르는 기능은 없다.
//
// applyFestival은 첫 화면이 그려지기 전 인라인 <script>로도 실행된다(layout이 toString으로 심는다).
// 그래서 바깥 변수·import·도우미 함수 없이 이 함수 하나로 끝나야 한다.

export type FestivalStop = { p: number; colors: Record<string, string> };
export type FestivalState = { p: number; fx: number; crowd: number; ember: number; daylight: boolean };

// p(하루 진행도, 0 = 아침 ~ 1.6 = 야간) 지점별 색.
//   iron·iron2·iron3·line: 바탕·카드·테두리, dough·dim: 글씨, sky1→sky2: 화면 하늘(위→아래), glow: 바닥 숯불빛,
//   horizon: 머리 지평선 뒤 축제 불빛, sil: 군중·관람차 실루엣 색.
// 0.649 → 0.651에서 밝은 화면(진한 글씨)이 어두운 화면(밝은 글씨)으로 넘어간다 — 글씨 대비를 지키려고 이 한 번만
// 4초에 걸쳐 바뀌고(globals.css 전환), 나머지는 시간 흐름대로 연속이다.
export const FESTIVAL_STOPS: readonly FestivalStop[] = [
    {
        p: 0,
        colors: {
            iron: "#fffaf3", iron2: "#ffffff", iron3: "#fff5ea", line: "#f0dfcc", dough: "#3b1a08", dim: "#7d5a43",
            sky1: "#f5f3ff", sky2: "#ffe7d2", glow: "rgba(255,183,120,0.25)", horizon: "rgba(255,200,150,0.35)", sil: "rgba(214,170,140,0.32)",
        },
    },
    {
        p: 0.25,
        colors: {
            iron: "#fff3e3", iron2: "#fffbf5", iron3: "#ffefdc", line: "#f2d3b2", dough: "#3b1a08", dim: "#7a5640",
            sky1: "#fff3e3", sky2: "#ffcf9c", glow: "rgba(255,160,90,0.32)", horizon: "rgba(255,170,100,0.42)", sil: "rgba(222,150,100,0.4)",
        },
    },
    {
        p: 0.45,
        colors: {
            iron: "#ffe6c8", iron2: "#fff8ee", iron3: "#ffe8cf", line: "#efc296", dough: "#3b1a08", dim: "#75503a",
            sky1: "#ffe2b8", sky2: "#f7a85c", glow: "rgba(255,135,55,0.4)", horizon: "rgba(255,150,70,0.5)", sil: "rgba(226,130,70,0.48)",
        },
    },
    {
        p: 0.649,
        colors: {
            iron: "#ffd2a3", iron2: "#fff3e4", iron3: "#ffe0c0", line: "#e8a874", dough: "#3b1a08", dim: "#6f4630",
            sky1: "#ffcf98", sky2: "#f08a45", glow: "rgba(240,105,35,0.5)", horizon: "rgba(255,130,50,0.55)", sil: "rgba(196,92,44,0.55)",
        },
    },
    {
        p: 0.651,
        colors: {
            iron: "#5a1e10", iron2: "#63261a", iron3: "#77301f", line: "#94452c", dough: "#fff1e0", dim: "#f0cfb6",
            sky1: "#a8401c", sky2: "#5a1e10", glow: "rgba(255,120,40,0.55)", horizon: "rgba(255,140,60,0.75)", sil: "rgba(60,14,8,0.92)",
        },
    },
    {
        p: 0.82,
        colors: {
            iron: "#45170e", iron2: "#4f1f16", iron3: "#63291c", line: "#7e3c28", dough: "#f7e8d0", dim: "#e3c3aa",
            sky1: "#8f3218", sky2: "#3a140c", glow: "rgba(255,120,40,0.5)", horizon: "rgba(255,130,50,0.8)", sil: "rgba(40,10,6,0.95)",
        },
    },
    {
        p: 1,
        colors: {
            iron: "#2a1210", iron2: "#36181a", iron3: "#452222", line: "#5e3330", dough: "#f7e8d0", dim: "#d6b9a3",
            sky1: "#2b1213", sky2: "#6e2412", glow: "rgba(255,110,40,0.5)", horizon: "rgba(255,120,40,0.85)", sil: "rgba(26,8,8,0.96)",
        },
    },
    {
        p: 1.15,
        colors: {
            iron: "#251011", iron2: "#321719", iron3: "#412022", line: "#593130", dough: "#f7e8d0", dim: "#d2b6a1",
            sky1: "#241012", sky2: "#7a2812", glow: "rgba(255,105,35,0.52)", horizon: "rgba(255,110,35,0.9)", sil: "rgba(22,7,8,0.96)",
        },
    },
    {
        p: 1.3,
        colors: {
            iron: "#1c1013", iron2: "#28191d", iron3: "#352328", line: "#4a3237", dough: "#f7e8d0", dim: "#c4ab99",
            sky1: "#160d10", sky2: "#3a1810", glow: "rgba(250,110,40,0.3)", horizon: "rgba(240,100,40,0.55)", sil: "rgba(14,8,10,0.96)",
        },
    },
    {
        p: 1.6,
        colors: {
            iron: "#15121a", iron2: "#211c25", iron3: "#2d2631", line: "#3a3140", dough: "#f7e8d0", dim: "#b3a497",
            sky1: "#15121a", sky2: "#1a1218", glow: "rgba(240,120,40,0.14)", horizon: "rgba(240,120,40,0.28)", sil: "rgba(10,8,12,0.95)",
        },
    },
];

export function applyFestival(stops: readonly FestivalStop[], nowMs?: number): FestivalState {
    const date = nowMs ? new Date(nowMs) : new Date();
    const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    // 하루 중 분 → 값(구간마다 직선으로 이어 부드럽게 바뀐다)
    const curve = (points: number[][]) => {
        if (minute <= points[0][0]) return points[0][1];
        for (let i = 1; i < points.length; i++) {
            if (minute <= points[i][0]) {
                const a = points[i - 1];
                const b = points[i];
                return a[1] + ((b[1] - a[1]) * (minute - a[0])) / (b[0] - a[0]);
            }
        }
        return points[points.length - 1][1];
    };
    // 새벽 5시까지 전날 밤(야간) → 5:00~6:30 해가 뜨며 아침으로 → 7:30 아침 → 10:30 오전 → 12:00 낮 → 14:00 오후
    // → 16:00 축제 본격 → 17:00 최고조 → 18:00 축제 끝 → 22:00 야간
    const p = curve([[0, 1.6], [300, 1.6], [390, 0], [450, 0], [630, 0.25], [720, 0.45], [840, 0.65], [900, 0.82], [960, 1], [1020, 1.15], [1080, 1.3], [1320, 1.6], [1440, 1.6]]);
    // 불꽃·반짝이·전구: 14:30 등장 → 15:30 활발 → 17:00 최고조 → 18:00 이후 점점 잦아들어 밤에는 가끔
    const fx = curve([[0, 0.35], [300, 0.35], [390, 0], [840, 0], [870, 0.2], [900, 0.45], [930, 0.6], [960, 0.8], [990, 0.92], [1020, 1], [1080, 0.9], [1200, 0.6], [1320, 0.35], [1440, 0.35]]);
    // 군중: 늦은 오전부터 모여 16:30에 가득 → 축제 끝나고 밤에는 절반쯤
    const crowd = curve([[0, 0.55], [300, 0.55], [390, 0], [660, 0], [840, 0.35], [870, 0.5], [930, 0.75], [990, 1], [1080, 1], [1320, 0.55], [1440, 0.55]]);
    const ember = Math.max(0, Math.min(1, (p - 0.45) / 0.55));

    const parse = (color: string) => {
        if (color[0] === "#") return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 1];
        const parts = color.slice(color.indexOf("(") + 1, -1).split(",").map(Number);
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    let upper = 1;
    while (upper < stops.length - 1 && stops[upper].p < p) upper++;
    const from = stops[upper - 1];
    const to = stops[upper];
    let t = to.p === from.p ? 1 : Math.max(0, Math.min(1, (p - from.p) / (to.p - from.p)));
    // 밝은↔어두운 경계(0.649→0.651)는 섞지 않고 한쪽으로 넘긴다 — 섞으면 바탕과 글씨가 같은 중간색이 된다.
    // 넘어가는 순간의 부드러움은 CSS 전환(4초)이 맡는다.
    if (to.p - from.p < 0.01) t = t < 0.5 ? 0 : 1;
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (root) {
        for (const key of Object.keys(to.colors)) {
            const a = parse(from.colors[key]);
            const b = parse(to.colors[key]);
            const mix = a.map((value, index) => value + (b[index] - value) * t);
            root.style.setProperty(
                "--fest-" + key,
                "rgba(" + Math.round(mix[0]) + "," + Math.round(mix[1]) + "," + Math.round(mix[2]) + "," + mix[3].toFixed(3) + ")",
            );
        }
        root.style.setProperty("--fest-ember", ember.toFixed(3));
        root.style.setProperty("--fest-fx", fx.toFixed(3));
        root.style.setProperty("--fest-crowd", crowd.toFixed(3));
        if (p < 0.65) root.setAttribute("data-daylight", "");
        else root.removeAttribute("data-daylight");
    }
    return { p, fx, crowd, ember, daylight: p < 0.65 };
}
