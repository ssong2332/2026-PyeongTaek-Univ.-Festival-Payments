// 호떡이 — 프론트 담당이 준 스티커 시트 2장(2026-10-05)에서 누끼를 딴 투명 WebP(public/mascot/hotteoki, 400×400).
// 순수 장식이라 화면 읽기 프로그램에서 숨긴다. 움직임(motion)은 globals.css 애니메이션이며 움직임 줄이기 설정이면 멈춘다.
export type HotteokiMood =
    | "hello" // 반가워(손 흔듦)
    | "excited" // 신나!
    | "wink" // 윙크!
    | "shy" // 부끄
    | "laugh" // 꺄르르
    | "pout" // 삐짐
    | "touched" // 감동(글썽)
    | "sleepy" // 졸려…
    | "eat" // 냠냠
    | "yummy" // 맛있다!
    | "chef" // 요리중!
    | "fighting" // 화이팅!
    | "full" // 배불러…
    | "cool" // 간지
    | "sleep" // 잘자
    | "real" // 진짜 호떡(반 갈라 호떡소)
    | "pay" // 동전 들고 두근
    | "run" // 쇼핑백 들고 달림
    | "receipt" // 영수증 펼침
    | "search" // 돋보기
    | "megaphone" // 확성기
    | "cry" // 눈물
    | "griddle" // 철판 위 지글지글
    | "dough" // 반죽 공 + 호떡소 그릇
    | "star" // 별 안기
    | "bye" // 배웅
    | "icon"; // 얼굴만

// 예전 이름(관리자 화면 등에서 쓰던 포즈)도 그대로 받아 가장 가까운 표정으로 보낸다.
type LegacyVariant = "default" | "wave" | "coin" | "heart" | "cheer" | "cook" | "think" | "sad";
export type MascotVariant = HotteokiMood | LegacyVariant;

const LEGACY: Record<LegacyVariant, HotteokiMood> = {
    default: "hello",
    wave: "hello",
    coin: "pay",
    heart: "shy",
    cheer: "excited",
    cook: "chef",
    think: "search",
    sad: "cry",
};

const MOTION_CLASS = {
    none: "",
    bob: "motion-safe:animate-bob",
    sway: "motion-safe:animate-sway",
    jump: "motion-safe:animate-hk-jump",
    wiggle: "motion-safe:animate-wiggle",
    breathe: "motion-safe:animate-breathe",
} as const;
export type MascotMotion = keyof typeof MOTION_CLASS;

export function moodOf(variant: MascotVariant): HotteokiMood {
    return variant in LEGACY ? LEGACY[variant as LegacyVariant] : (variant as HotteokiMood);
}

export function mascotSrc(variant: MascotVariant): string {
    return `/mascot/hotteoki/${moodOf(variant)}.webp`;
}

export function HotteokMascot({
    variant = "hello",
    size = 48,
    motion = "none",
    className = "",
}: {
    variant?: MascotVariant;
    size?: number;
    motion?: MascotMotion;
    className?: string;
}) {
    return (
        // 작은 고정 스티커라 next/image 최적화가 필요 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={mascotSrc(variant)}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            draggable={false}
            decoding="async"
            className={`pointer-events-none shrink-0 select-none object-contain drop-shadow-[0_8px_10px_rgba(10,4,20,0.28)] ${MOTION_CLASS[motion]} ${className}`}
        />
    );
}
