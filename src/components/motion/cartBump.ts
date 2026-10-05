"use client";

import { useAnimationControls } from "motion/react";
import { useEffect } from "react";

// 장바구니로 날아간 호떡이 도착하는 순간 장바구니 버튼·배지가 "받았다"는 듯 출렁인다.
// 날리는 쪽(fly-to-cart)이 bumpCart()를 부르고, 버튼들은 useCartBump()의 controls를 animate에 건다.
const EVENT = "hotteok:cart-bump";

export function bumpCart() {
    window.dispatchEvent(new Event(EVENT));
}

export function useCartBump() {
    const controls = useAnimationControls();
    useEffect(() => {
        const onBump = () => {
            void controls.start({
                scale: [1, 1.28, 0.9, 1.06, 1],
                rotate: [0, -10, 8, -3, 0],
                transition: { duration: 0.55, ease: "easeOut" },
            });
        };
        window.addEventListener(EVENT, onBump);
        return () => window.removeEventListener(EVENT, onBump);
    }, [controls]);
    return controls;
}

// 화면에 보이는 장바구니 목적지(바 안의 버튼 → 머리의 버튼 순)의 위치
export function cartTargetRect(): DOMRect | null {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-target]"));
    const visible = targets
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight);
    return visible.at(-1) ?? null;
}
