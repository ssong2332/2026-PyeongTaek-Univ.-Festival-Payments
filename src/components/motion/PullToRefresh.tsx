"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

const ARM_AT = 80; // 이만큼(px) 당기면 놓았을 때 새로고침
const MAX_PULL = 130;

// 당겨서 새로고침 — 맨 위에서 끌어내리면 철판 위 반죽이 점점 눌리고, 기준을 넘겨 놓으면 호떡이 휙 뒤집히며 다시 불러온다.
// 터치 기기에서만 동작하고, 화면 읽기 프로그램에는 숨긴다(같은 기능은 오류 시 "다시 시도" 버튼이 제공).
export function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
    const pull = useMotionValue(0);
    const squash = useTransform(pull, [0, ARM_AT], [1, 0.5]);
    const widen = useTransform(pull, [0, ARM_AT], [1, 1.4]);
    const color = useTransform(pull, [0, ARM_AT], ["#f7e8d0", "#d9913f"]);
    const indicatorY = useTransform(pull, [0, MAX_PULL], [-56, 28]);
    const [flipping, setFlipping] = useState(false);
    const start = useRef<number | null>(null);
    const armed = useRef(false);

    useEffect(() => {
        function onStart(event: TouchEvent) {
            start.current = window.scrollY <= 0 ? event.touches[0].clientY : null;
        }
        function onMove(event: TouchEvent) {
            if (start.current === null) return;
            const distance = event.touches[0].clientY - start.current;
            if (distance <= 0) return pull.set(0);
            const damped = Math.min(MAX_PULL, distance * 0.5);
            pull.set(damped);
            armed.current = damped >= ARM_AT;
        }
        function onEnd() {
            if (start.current === null) return;
            start.current = null;
            if (armed.current) {
                armed.current = false;
                setFlipping(true);
                onRefresh();
                try {
                    navigator.vibrate?.(20);
                } catch {
                    // 진동이 없어도 화면 연출은 그대로다.
                }
                setTimeout(() => {
                    setFlipping(false);
                    void animate(pull, 0, { type: "spring", stiffness: 300, damping: 30 });
                }, 700);
            } else {
                void animate(pull, 0, { type: "spring", stiffness: 400, damping: 30 });
            }
        }
        window.addEventListener("touchstart", onStart, { passive: true });
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onEnd);
        return () => {
            window.removeEventListener("touchstart", onStart);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
        };
    }, [onRefresh, pull]);

    return (
        <motion.div aria-hidden="true" style={{ y: indicatorY }} className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
            <div className="flex flex-col items-center">
                <motion.span
                    style={{ scaleY: flipping ? 1 : squash, scaleX: flipping ? 1 : widen, backgroundColor: color }}
                    animate={flipping ? { rotateX: [0, 360], y: [0, -24, 0] } : { rotateX: 0, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                    className="block size-9 rounded-full shadow-[0_0_16px_rgba(255,181,71,0.55)]"
                />
                <span className="mt-1 h-1.5 w-16 rounded-full bg-iron-line" />
            </div>
        </motion.div>
    );
}
