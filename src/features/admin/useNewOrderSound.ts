"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useNewOrderSound() {
    const audioContextRef = useRef<AudioContext | null>(null);
    const [enabled, setEnabled] = useState(false);

    /**
     * 관리자 사용자가 직접 버튼을 눌렀을 때 호출.
     * 브라우저 자동재생 정책 때문에 사용자 입력 이후
     * AudioContext를 활성화해야 한다.
     */
    const enable = useCallback(async () => {
        try {
            let context = audioContextRef.current;

            if (!context) {
                context = new AudioContext();
                audioContextRef.current = context;
            }

            if (context.state === "suspended") {
                await context.resume();
            }

            if (context.state !== "running") {
                throw new Error(`AudioContext is ${context.state}`);
            }

            setEnabled(true);
        } catch (error) {
            console.warn("[NewOrderSound] 알림음을 활성화하지 못했습니다.", error);
            setEnabled(false);
        }
    }, []);

    /**
     * 알림음만 끈다.
     * AudioContext 자체를 매번 제거하지 않는 이유는
     * 다시 켤 때 브라우저 자동재생 제한에 걸릴 가능성을 줄이기 위함.
     */
    const disable = useCallback(() => {
        setEnabled(false);
    }, []);

    /**
     * 짧은 2음 띵동 효과음.
     * 외부 mp3/wav 파일 없이 Web Audio API로 생성한다.
     */
const play = useCallback(async () => {
    if (!enabled) return;

    const context = audioContextRef.current;

    if (!context) {
        return;
    }

    try {
        // 백그라운드/절전 등으로 AudioContext가 중지된 경우 다시 활성화
        if (context.state === "suspended") {
            await context.resume();
        }

        // resume 후에도 실행 상태가 아니라면 재생하지 않음
        if (context.state !== "running") {
            return;
        }

        const playTone = (
            frequency: number,
            startTime: number,
            duration: number,
        ) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();

            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(
                frequency,
                startTime,
            );

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(
                0.18,
                startTime + 0.02,
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                startTime + duration,
            );

            oscillator.connect(gain);
            gain.connect(context.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };

        const now = context.currentTime;

        // 띵
        playTone(659.25, now, 0.28);

        // 동
        playTone(523.25, now + 0.2, 0.35);
    } catch (error) {
        // 알림음 실패가 주문 처리에 절대 영향을 주지 않도록 한다.
        console.warn("[NewOrderSound] 알림음 재생 실패", error);
    }
}, [enabled]);

    /**
     * 컴포넌트가 완전히 사라질 때 AudioContext 정리.
     */
    useEffect(() => {
        return () => {
            const context = audioContextRef.current;

            if (context && context.state !== "closed") {
                void context.close();
            }

            audioContextRef.current = null;
        };
    }, []);

    return {
        enabled,
        enable,
        disable,
        play,
    };
}