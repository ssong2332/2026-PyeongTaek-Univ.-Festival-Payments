import type { CSSProperties } from "react";
import { FESTIVAL_ART } from "./festivalArt";

// 메뉴판 머리 아래의 축제 지평선(장식): 관람차·천막·무대 실루엣 뒤로 축제 불빛이 번지고, 앞에는 군중이 환호한다.
// 실루엣은 Flaticon 그림을 마스크로 써서 시간대 색(--fest-sil)으로 칠한다 — 아침엔 옅은 피치빛 마을, 오후·밤엔 검은 군중.
// 사람 수는 --fest-crowd(festivalTheme)에 따라 늘어난다(각 사람의 --th를 넘으면 나타남). 무대 조명·전구는 --fest-fx로 켜진다.
// 서버는 시각을 모르므로 모든 사람을 그려 두고 CSS 변수로만 보이기를 바꾼다(hydration 차이 없음).

type Figure = {
    src: string;
    left: string;
    height: number;
    th: number;
    motion?: "bob" | "jump" | "sway";
    dur?: number;
    delay?: number;
    flip?: boolean;
    bottom?: number;
};

// 뒷줄: 작은 군중 덩어리를 이어 붙여 사람 바다를 만든다(먼저 나타남)
const BACK_ROW: Figure[] = [
    { src: FESTIVAL_ART.crowdRows, left: "-6%", height: 46, th: 0.05 },
    { src: FESTIVAL_ART.crowdPack, left: "14%", height: 50, th: 0.3, motion: "sway", dur: 4.2 },
    { src: FESTIVAL_ART.crowdRows, left: "33%", height: 44, th: 0.15 },
    { src: FESTIVAL_ART.crowdGroup, left: "51%", height: 48, th: 0.42, motion: "sway", dur: 3.6, delay: -1 },
    { src: FESTIVAL_ART.crowdRows, left: "68%", height: 46, th: 0.1 },
    { src: FESTIVAL_ART.crowdPack, left: "86%", height: 50, th: 0.25, motion: "sway", dur: 4.8, delay: -2 },
];

// 앞줄: 한 사람·두세 사람씩, 시간이 갈수록 더 많이(그리고 더 신나게) 나타난다
const FRONT_ROW: Figure[] = [
    { src: FESTIVAL_ART.personCheerA, left: "3%", height: 50, th: 0.2, motion: "jump", dur: 1.3 },
    { src: FESTIVAL_ART.personCouple, left: "12%", height: 46, th: 0.35, motion: "bob", dur: 2.2 },
    { src: FESTIVAL_ART.crowdConcert, left: "22%", height: 56, th: 0.5, motion: "bob", dur: 1.7, delay: -0.4 },
    { src: FESTIVAL_ART.personDancePair, left: "35%", height: 50, th: 0.28, motion: "sway", dur: 1.6 },
    { src: FESTIVAL_ART.personJump, left: "45%", height: 44, th: 0.62, motion: "jump", dur: 1.1, delay: -0.3 },
    { src: FESTIVAL_ART.personCheers, left: "54%", height: 50, th: 0.4, motion: "bob", dur: 2, delay: -0.8 },
    { src: FESTIVAL_ART.personCheerB, left: "64%", height: 46, th: 0.55, motion: "jump", dur: 1.4, delay: -0.6 },
    { src: FESTIVAL_ART.personDanceGroup, left: "72%", height: 54, th: 0.3, motion: "sway", dur: 1.8, delay: -0.2 },
    { src: FESTIVAL_ART.personCheerA, left: "84%", height: 48, th: 0.7, motion: "jump", dur: 1.25, delay: -0.5, flip: true },
    { src: FESTIVAL_ART.personCouple, left: "91%", height: 44, th: 0.45, motion: "bob", dur: 2.4, delay: -1.2, flip: true },
];

// 맨 앞 양 끝에서 치켜든 손(공연장 느낌) — 축제가 무르익으면 나타난다
const HANDS: Figure[] = [
    { src: FESTIVAL_ART.crowdHands, left: "-7%", height: 74, th: 0.75, motion: "sway", dur: 1.5, bottom: -14 },
    { src: FESTIVAL_ART.crowdHands, left: "80%", height: 70, th: 0.85, motion: "sway", dur: 1.7, delay: -0.6, bottom: -16, flip: true },
];

// 지평선을 가로질러 걸어가는 사람들(걷는 속도·방향이 제각각)
const WALKERS = [
    { src: FESTIVAL_ART.personWalkA, th: 0.15, dur: 26, delay: -4, reverse: false, height: 34 },
    { src: FESTIVAL_ART.personWalkB, th: 0.4, dur: 21, delay: -13, reverse: true, height: 32 },
    { src: FESTIVAL_ART.personWalkC, th: 0.65, dur: 30, delay: -20, reverse: false, height: 36 },
];

function figureStyle(figure: Figure): CSSProperties {
    return {
        left: figure.left,
        bottom: figure.bottom ?? 0,
        height: figure.height,
        width: figure.height,
        "--src": `url(${figure.src})`,
        "--th": figure.th,
        "--dur": `${figure.dur ?? 2}s`,
        "--delay": `${figure.delay ?? 0}s`,
    } as CSSProperties;
}

function Silhouette({ figure }: { figure: Figure }) {
    const motionClass = figure.motion ? `fest-${figure.motion}` : "";
    return (
        <span className="fest-crowd-item absolute" style={figureStyle(figure)}>
            <span className={`fest-sil block size-full origin-bottom ${motionClass} ${figure.flip ? "-scale-x-100" : ""}`} />
        </span>
    );
}

export function FestivalHorizon() {
    return (
        <div aria-hidden="true" className="pointer-events-none relative -mx-5 mt-1 h-[132px] overflow-hidden select-none">
            {/* 지평선 뒤 축제 불빛 */}
            <span className="fest-horizon-glow absolute inset-0" />
            {/* 무대 조명: 무대 위에서 하늘로 빛기둥 두 개가 엇갈려 훑는다(축제가 무르익을수록 진하게) */}
            <span className="fest-fx-item absolute right-[13%] bottom-[54px] h-[150px] w-10 origin-bottom" style={{ "--th": 0.25 } as CSSProperties}>
                <span className="fest-beam block size-full" />
            </span>
            <span className="fest-fx-item absolute right-[13%] bottom-[54px] h-[150px] w-10 origin-bottom" style={{ "--th": 0.45 } as CSSProperties}>
                <span className="fest-beam fest-beam-b block size-full" />
            </span>
            {/* 마을 실루엣: 관람차·천막·무대(하루 종일 보이고, 색만 시간대를 따른다) */}
            <span className="fest-skyline absolute inset-0">
                <span className="fest-sil absolute bottom-[18px] left-[3%] size-[108px]" style={{ "--src": `url(${FESTIVAL_ART.skyFerris})` } as CSSProperties} />
                <span className="fest-sil absolute bottom-[20px] left-[33%] size-[52px] opacity-80" style={{ "--src": `url(${FESTIVAL_ART.skyTent})` } as CSSProperties} />
                <span className="fest-sil absolute bottom-[22px] left-[52%] size-[70px]" style={{ "--src": `url(${FESTIVAL_ART.skyTent})` } as CSSProperties} />
                <span className="fest-sil absolute right-[4%] bottom-[22px] size-[86px]" style={{ "--src": `url(${FESTIVAL_ART.skyStage})` } as CSSProperties} />
            </span>
            {BACK_ROW.map((figure, index) => (
                <Silhouette key={`b${index}`} figure={{ ...figure, bottom: 10 }} />
            ))}
            {WALKERS.map((walker, index) => (
                <span
                    key={`w${index}`}
                    className={`fest-crowd-item fest-walk absolute inset-x-0 bottom-[4px] ${walker.reverse ? "fest-walk-reverse" : ""}`}
                    style={{ height: walker.height, "--th": walker.th, "--dur": `${walker.dur}s`, "--delay": `${walker.delay}s` } as CSSProperties}
                >
                    <span
                        className={`fest-sil fest-bob absolute bottom-0 left-0 ${walker.reverse ? "-scale-x-100" : ""}`}
                        style={{ width: walker.height, height: walker.height, "--src": `url(${walker.src})`, "--dur": "0.55s" } as CSSProperties}
                    />
                </span>
            ))}
            {FRONT_ROW.map((figure, index) => (
                <Silhouette key={`f${index}`} figure={figure} />
            ))}
            {HANDS.map((figure, index) => (
                <Silhouette key={`h${index}`} figure={figure} />
            ))}
            {/* 아래쪽은 화면 바탕으로 자연스럽게 녹인다 */}
            <span className="absolute inset-x-0 bottom-0 h-5 bg-linear-to-t from-iron to-transparent" />
        </div>
    );
}
