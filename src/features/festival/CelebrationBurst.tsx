"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { FESTIVAL_ART, SPARKLE_SPRITES } from "./festivalArt";

// 축하 폭죽(장식): 화면 아래 양쪽에서 폭죽(Flaticon 그림)이 "펑" 하고 터지며 색종이 묶음이 포물선으로 날아올랐다가
// 빙글빙글 떨어지고, 둘레에 금빛 반짝이가 깜빡인다. 주문 접수·호떡 완성 순간에 한 번 쓴다. 클릭을 막지 않는다.
// 위치·회전·속도는 렌더할 때 한 번 랜덤으로 정해진다(매번 다른 모양).

const PIECES = [FESTIVAL_ART.confettiMix, FESTIVAL_ART.confettiRibbons, FESTIVAL_ART.confettiStars, FESTIVAL_ART.celebration];

type Piece = { src: string; side: -1 | 1; dx: number; peak: number; fall: number; size: number; rotate: number; delay: number; duration: number };
type Twinkle = { src: string; left: string; top: string; size: number; delay: number };

function makePieces(count: number): Piece[] {
    return Array.from({ length: count }, (_, index) => {
        const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
        return {
            src: PIECES[index % PIECES.length],
            side,
            // 왼쪽 폭죽은 오른쪽 위로, 오른쪽 폭죽은 왼쪽 위로 쏜다
            dx: -side * (40 + Math.random() * 170),
            peak: 260 + Math.random() * 260,
            fall: 120 + Math.random() * 200,
            size: 26 + Math.random() * 26,
            rotate: (Math.random() - 0.5) * 720,
            delay: Math.random() * 0.18,
            duration: 1.6 + Math.random() * 0.9,
        };
    });
}

function makeTwinkles(count: number): Twinkle[] {
    return Array.from({ length: count }, (_, index) => ({
        src: SPARKLE_SPRITES[index % SPARKLE_SPRITES.length],
        left: `${8 + Math.random() * 84}%`,
        top: `${12 + Math.random() * 50}%`,
        size: 18 + Math.random() * 20,
        delay: 0.35 + Math.random() * 1.1,
    }));
}

export function CelebrationBurst({ delay = 0, pieces = 22 }: { delay?: number; pieces?: number }) {
    const confetti = useMemo(() => makePieces(pieces), [pieces]);
    const twinkles = useMemo(() => makeTwinkles(8), []);
    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {/* 폭죽 두 개: 아래 모서리에서 튀어 올라 "펑" 반동 */}
            {([-1, 1] as const).map((side) => (
                <motion.img
                    key={side}
                    src={side < 0 ? FESTIVAL_ART.popperA : FESTIVAL_ART.popperB}
                    alt=""
                    className="absolute bottom-6 size-24"
                    style={side < 0 ? { left: 6 } : { right: 6, scaleX: -1 }}
                    initial={{ y: 120, rotate: side * 30, opacity: 0 }}
                    animate={{ y: [120, 0, 6, 0, 0, 140], rotate: [side * 30, side * -8, side * 4, 0, 0, side * 20], opacity: [0, 1, 1, 1, 1, 0] }}
                    transition={{ duration: 2.6, delay, times: [0, 0.14, 0.2, 0.26, 0.82, 1], ease: "easeOut" }}
                />
            ))}
            {/* 색종이 묶음: 폭죽 입구에서 포물선으로 날아올랐다가 돌며 떨어진다 */}
            {confetti.map((piece, index) => (
                <motion.img
                    key={index}
                    src={piece.src}
                    alt=""
                    className="absolute bottom-24"
                    style={{ width: piece.size, height: piece.size, [piece.side < 0 ? "left" : "right"]: 48 }}
                    initial={{ x: 0, y: 0, scale: 0.2, rotate: 0, opacity: 0 }}
                    animate={{
                        x: [0, piece.dx * 0.7, piece.dx],
                        y: [0, -piece.peak, -piece.peak + piece.fall],
                        scale: [0.2, 1, 0.85],
                        rotate: [0, piece.rotate * 0.6, piece.rotate],
                        opacity: [0, 1, 0],
                    }}
                    transition={{ duration: piece.duration, delay: delay + 0.12 + piece.delay, times: [0, 0.38, 1], ease: ["easeOut", "easeIn"] }}
                />
            ))}
            {/* 금빛 반짝이 */}
            {twinkles.map((twinkle, index) => (
                <motion.img
                    key={`t${index}`}
                    src={twinkle.src}
                    alt=""
                    className="absolute"
                    style={{ left: twinkle.left, top: twinkle.top, width: twinkle.size, height: twinkle.size }}
                    initial={{ scale: 0, rotate: -40, opacity: 0 }}
                    animate={{ scale: [0, 1.15, 0], rotate: [-40, 0, 30], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.9, delay: delay + twinkle.delay, ease: "easeOut" }}
                />
            ))}
        </div>
    );
}

// active가 false → true로 바뀌는 순간(예: 호떡 완성)에만 폭죽을 한 번 터뜨린다. 처음부터 true면 터뜨리지 않는다.
export function CelebrateWhen({ active }: { active: boolean }) {
    const [previous, setPrevious] = useState(active);
    const [burstKey, setBurstKey] = useState(0);
    // 렌더 중 이전 값과 비교해 상태를 맞춘다(React 권장: props 변화에 따른 상태 조정)
    if (active !== previous) {
        setPrevious(active);
        if (active) setBurstKey((key) => key + 1);
    }
    return burstKey > 0 ? <CelebrationBurst key={burstKey} /> : null;
}
