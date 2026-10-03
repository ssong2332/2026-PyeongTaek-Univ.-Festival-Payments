// 호떡 마스코트(프론트 담당 Figma Make 업그레이드의 SVG 5종, public/mascot). 순수 장식이라 스크린리더에서 숨긴다.
// 움직임은 motion-safe: 일 때만 — 움직임 줄이기 설정이면 멈춘다.
export type MascotVariant = "default" | "wave" | "chef" | "coin" | "heart";

const MOTION_CLASS = {
    none: "",
    bob: "motion-safe:animate-bob",
    sway: "motion-safe:animate-sway",
} as const;

export function HotteokMascot({
    variant = "default",
    size = 48,
    motion = "none",
    className = "",
}: {
    variant?: MascotVariant;
    size?: number;
    motion?: keyof typeof MOTION_CLASS;
    className?: string;
}) {
    return (
        // 작은 고정 SVG라 next/image 최적화가 필요 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`/mascot/${variant}.svg`}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            draggable={false}
            className={`pointer-events-none shrink-0 select-none drop-shadow-[0_6px_10px_rgba(122,65,42,0.16)] ${MOTION_CLASS[motion]} ${className}`}
        />
    );
}
