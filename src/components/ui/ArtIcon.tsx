import { CUSTOMER_ICONS, type CustomerIconName } from "@/features/customer/customerIcons";

// 일러스트 아이콘(Flaticon, public/icons). 장식이라 화면 읽기에서 숨기고, 의미는 옆 글자·aria-label이 전한다.
// motion: globals.css의 art-* 애니메이션(동작 줄이기면 멈춤) — float 둥실, wiggle 흔들, ring 종 흔들기, flip 모래시계 뒤집기,
// sizzle 지글지글 떨림, pop 처음 나타날 때 튀어나옴, spin 동전 돌기.
export type ArtIconMotion = "none" | "float" | "wiggle" | "ring" | "flip" | "sizzle" | "pop" | "spin";

export function ArtIcon({
    name,
    size = 40,
    motion = "none",
    className = "",
}: {
    name: CustomerIconName;
    size?: number;
    motion?: ArtIconMotion;
    className?: string;
}) {
    return (
        // 작은 정적 그림이라 next/image 최적화가 필요 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={CUSTOMER_ICONS[name]}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            draggable={false}
            decoding="async"
            className={`pointer-events-none shrink-0 select-none object-contain drop-shadow-[0_6px_10px_rgba(10,4,20,0.35)] ${motion === "none" ? "" : `art-${motion}`} ${className}`}
        />
    );
}
