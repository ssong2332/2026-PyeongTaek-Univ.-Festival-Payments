import { MotionGlobalConfig, type Transition, type Variants } from "motion/react";

// 고객 화면 모션 공통값. 움직임 줄이기 설정은 CustomerMotion(MotionConfig reducedMotion="user")이 처리한다.
export const SPRING: Transition = { type: "spring", stiffness: 340, damping: 28 };
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 180, damping: 22 };
export const SPRING_BOUNCY: Transition = { type: "spring", stiffness: 520, damping: 16 };

// 목록·카드가 차례로 떠오른다.
export const STAGGER: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const RISE: Variants = {
    hidden: { opacity: 0, y: 18, scale: 0.97 },
    show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

export const FADE: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.35 } },
};

// 공유 요소(layoutId) 이름. 애니메이션을 끈 환경(단위 테스트의 jsdom)은 레이아웃을 잴 수 없어
// layoutId가 든 요소의 퇴장이 끝나지 않으므로, 그때만 공유 요소를 쓰지 않는다. 실제 브라우저는 항상 이어진다.
export function sharedLayoutId(id: string): string | undefined {
    return MotionGlobalConfig.skipAnimations ? undefined : id;
}

// 연출을 보여 주려고 기다리는 시간. 애니메이션을 끈 환경(단위 테스트)에서는 기다리지 않는다.
export function motionDelay(ms: number): number {
    return MotionGlobalConfig.skipAnimations ? 0 : ms;
}
