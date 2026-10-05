import { MotionGlobalConfig } from "motion/react";

// 단위 테스트는 화면 결과만 본다 — 모션(스프링·퇴장 애니메이션)은 즉시 끝나게 한다.
MotionGlobalConfig.skipAnimations = true;

// jsdom에는 IntersectionObserver가 없다 — 스크롤 등장 모션(whileInView)이 쓰므로 "바로 보임"으로 대신한다.
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
    class ImmediateIntersectionObserver {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(target: Element) {
            this.callback([{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return [];
        }
    }
    Object.defineProperty(window, "IntersectionObserver", { value: ImmediateIntersectionObserver, writable: true });
}
