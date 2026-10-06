"use client";

import { useEffect } from "react";

const COLORS = ["#ffd27a", "#f0612a", "#ffb08a", "#e4572e"];
const PER_TAP = 7;

// 화면을 톡 누르면 누른 자리에서 흑설탕·설탕 가루가 톡톡 튄다(장식). 움직임 줄이기 설정이면 아무것도 하지 않는다.
// React 상태 없이 DOM 조각을 잠깐 붙였다 떼므로 화면 렌더링에 영향이 없다.
export function TapSparkles() {
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    function burst(event: PointerEvent) {
      if (reduced?.matches || event.pointerType === "mouse") return;
      for (let index = 0; index < PER_TAP; index++) {
        const dot = document.createElement("span");
        const angle = (index / PER_TAP) * Math.PI * 2 + Math.random() * 0.6;
        const distance = 22 + Math.random() * 26;
        const size = 4 + Math.random() * 4;
        dot.setAttribute("aria-hidden", "true");
        Object.assign(dot.style, {
          position: "fixed",
          left: `${event.clientX - size / 2}px`,
          top: `${event.clientY - size / 2}px`,
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: index % 2 ? "9999px" : "2px",
          background: COLORS[index % COLORS.length],
          pointerEvents: "none",
          zIndex: "60",
        });
        document.body.appendChild(dot);
        const animation = dot.animate(
          [
            { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
            { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + 18}px) scale(0.3) rotate(${180 + index * 40}deg)`, opacity: 0 },
          ],
          { duration: 520 + Math.random() * 200, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
        );
        animation.onfinish = () => dot.remove();
      }
    }
    window.addEventListener("pointerdown", burst, { passive: true });
    return () => window.removeEventListener("pointerdown", burst);
  }, []);
  return null;
}
