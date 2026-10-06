// 축제 이펙트 그림(public/festival/*.webp). 원본은 Flaticon 무료 아이콘(무료 라이선스: 출처 표기 필요) —
// 출처·작가 목록은 FESTIVAL_CREDITS에 있고 /credits 화면에 표시한다. 512px PNG를 WebP로 줄여 두었다.

const art = (name: string) => `/festival/${name}.webp`;

export const FESTIVAL_ART = {
    crowdConcert: art("crowd-concert"),
    crowdHands: art("crowd-hands"),
    crowdGroup: art("crowd-group"),
    crowdRows: art("crowd-rows"),
    crowdPack: art("crowd-pack"),
    personCheerA: art("person-cheer-a"),
    personCheerB: art("person-cheer-b"),
    personDancePair: art("person-dance-pair"),
    personDanceGroup: art("person-dance-group"),
    personCouple: art("person-couple"),
    personJump: art("person-jump"),
    personCheers: art("person-cheers"),
    personWalkA: art("person-walk-a"),
    personWalkB: art("person-walk-b"),
    personWalkC: art("person-walk-c"),
    skyFerris: art("sky-ferris"),
    skyTent: art("sky-tent"),
    skyStage: art("sky-stage"),
    lightsString: art("lights-string"),
    lightsBulbs: art("lights-bulbs"),
    popperA: art("popper-a"),
    popperB: art("popper-b"),
    confettiMix: art("confetti-mix"),
    confettiRibbons: art("confetti-ribbons"),
    confettiStars: art("confetti-stars"),
    celebration: art("celebration"),
} as const;

// 캔버스(FestivalStage)가 쓰는 묶음
export const FIREWORK_SPRITES = [
    art("fw-gold-pink"),
    art("fw-multi"),
    art("fw-gold"),
    art("fw-red-gold"),
    art("fw-gold-willow"),
    art("fw-cluster"),
    art("fw-red"),
    art("fw-sunset"),
    art("fw-violet"),
] as const;
// 단색(검정) 불꽃 — 캔버스에서 원하는 색으로 칠해 쓴다
export const FIREWORK_MONO = [art("fw-burst-mono")] as const;
export const SPARKLE_SPRITES = [art("sparkle-gold-trio"), art("sparkle-gold-duo"), art("sparkle-gold-pair")] as const;
export const SPARKLE_MONO = art("sparkle-mono");
export const SHOOTING_STARS = [art("shooting-star-a"), art("shooting-star-b"), art("shooting-star-c")] as const;
// 아래 군중(캔버스)에 쓰는 실루엣
export const CROWD_SPRITES = [
    art("person-cheer-a"),
    art("person-cheer-b"),
    art("person-couple"),
    art("person-dance-pair"),
    art("person-cheers"),
    art("crowd-group"),
    art("person-jump"),
    art("person-dance-group"),
] as const;
export const WALKER_SPRITES = [art("person-walk-a"), art("person-walk-b"), art("person-walk-c")] as const;

// src가 없으면 public/festival/{file}.webp
export type FestivalCredit = { file: string; title: string; author: string | null; url: string; src?: string };

// Flaticon 무료 라이선스 출처 표기. author가 null인 항목은 아이콘 페이지(url)에 작가가 표시된다.
export const FESTIVAL_CREDITS: readonly FestivalCredit[] = [
    { file: "crowd-concert", title: "Concert", author: "Magnific", url: "https://www.flaticon.com/free-icon/concert_431247" },
    { file: "crowd-hands", title: "Hands up", author: "Victoruler", url: "https://www.flaticon.com/free-icon/hands-up_2564954" },
    { file: "crowd-group", title: "People", author: "kornkun", url: "https://www.flaticon.com/free-icon/people_11362489" },
    { file: "crowd-rows", title: "Team", author: "Prosymbols Premium", url: "https://www.flaticon.com/free-icon/team_9613227" },
    { file: "crowd-pack", title: "Crowd", author: "gravisio", url: "https://www.flaticon.com/free-icon/crowd_16084813" },
    { file: "person-cheer-a", title: "Man", author: "DinosoftLabs", url: "https://www.flaticon.com/free-icon/man_3439489" },
    { file: "person-cheer-b", title: "Man", author: "Vector Stall", url: "https://www.flaticon.com/free-icon/man_8455572" },
    { file: "person-dance-pair", title: "Dancing", author: "Magnific", url: "https://www.flaticon.com/free-icon/dancing_3058898" },
    { file: "person-dance-group", title: "Dance", author: "mia elysia", url: "https://www.flaticon.com/free-icon/dance_18701912" },
    { file: "person-couple", title: "Couple", author: "Prosymbols Premium", url: "https://www.flaticon.com/free-icon/couple_8803986" },
    { file: "person-jump", title: "Dance", author: "Mayor Icons", url: "https://www.flaticon.com/free-icon/dance_9169288" },
    { file: "person-cheers", title: "Cheers", author: "Prosymbols Premium", url: "https://www.flaticon.com/free-icon/cheers_8804473" },
    { file: "person-walk-a", title: "Walk", author: "Ferdinand", url: "https://www.flaticon.com/free-icon/walk_7458163" },
    { file: "person-walk-b", title: "Walk", author: "Icon Mela", url: "https://www.flaticon.com/free-icon/walk_7555057" },
    { file: "person-walk-c", title: "Walk", author: "icon_small", url: "https://www.flaticon.com/free-icon/walk_8684601" },
    { file: "fw-burst-mono", title: "Fireworks", author: "Magnific", url: "https://www.flaticon.com/free-icon/fireworks_2963356" },
    { file: "fw-gold-pink", title: "Fireworks", author: "June Design", url: "https://www.flaticon.com/free-icon/fireworks_6706908" },
    { file: "fw-multi", title: "Fireworks", author: "Magnific", url: "https://www.flaticon.com/free-icon/fireworks_2454229" },
    { file: "fw-gold", title: "Firework", author: "Moudesain", url: "https://www.flaticon.com/free-icon/firework_9274880" },
    { file: "fw-red-gold", title: "Fireworks", author: "shmai", url: "https://www.flaticon.com/free-icon/fireworks_6407995" },
    { file: "fw-gold-willow", title: "Fireworks", author: "kornkun", url: "https://www.flaticon.com/free-icon/fireworks_12771437" },
    { file: "fw-cluster", title: "Fireworks", author: "kornkun", url: "https://www.flaticon.com/free-icon/fireworks_9074446" },
    { file: "fw-red", title: "Fireworks", author: null, url: "https://www.flaticon.com/free-icon/fireworks_12771561" },
    { file: "fw-sunset", title: "Fireworks", author: null, url: "https://www.flaticon.com/free-icon/fireworks_6706914" },
    { file: "fw-violet", title: "Fireworks", author: null, url: "https://www.flaticon.com/free-icon/fireworks_9552153" },
    { file: "sparkle-mono", title: "Sparkle", author: null, url: "https://www.flaticon.com/free-icon/sparkle_8369316" },
    { file: "sparkle-gold-trio", title: "Star", author: null, url: "https://www.flaticon.com/free-icon/star_7334113" },
    { file: "sparkle-gold-duo", title: "Sparkling", author: null, url: "https://www.flaticon.com/free-icon/sparkling_15893074" },
    { file: "sparkle-gold-pair", title: "Sparkling", author: null, url: "https://www.flaticon.com/free-icon/sparkling_2267359" },
    { file: "shooting-star-a", title: "Shooting star", author: null, url: "https://www.flaticon.com/free-icon/shooting-star_616486" },
    { file: "shooting-star-b", title: "Shooting star", author: null, url: "https://www.flaticon.com/free-icon/shooting-star_8312498" },
    { file: "shooting-star-c", title: "Shooting star", author: null, url: "https://www.flaticon.com/free-icon/shooting-star_3730618" },
    { file: "sky-ferris", title: "Ferris wheel", author: null, url: "https://www.flaticon.com/free-icon/ferris-wheel_3978429" },
    { file: "sky-tent", title: "Carnival", author: null, url: "https://www.flaticon.com/free-icon/carnival_1626554" },
    { file: "sky-stage", title: "Stage", author: null, url: "https://www.flaticon.com/free-icon/stage_8295821" },
    { file: "lights-string", title: "String lights", author: null, url: "https://www.flaticon.com/free-icon/string-lights_13487969" },
    { file: "lights-bulbs", title: "Light bulb", author: null, url: "https://www.flaticon.com/free-icon/light-bulb_9343310" },
    { file: "confetti-mix", title: "Confetti", author: null, url: "https://www.flaticon.com/free-icon/confetti_9114429" },
    { file: "confetti-ribbons", title: "Confetti", author: null, url: "https://www.flaticon.com/free-icon/confetti_4525688" },
    { file: "confetti-stars", title: "Confetti", author: null, url: "https://www.flaticon.com/free-icon/confetti_6777481" },
    { file: "celebration", title: "Celebration", author: null, url: "https://www.flaticon.com/free-icon/celebration_9725867" },
    { file: "popper-a", title: "Confetti", author: null, url: "https://www.flaticon.com/free-icon/confetti_4213475" },
    { file: "popper-b", title: "Confetti", author: null, url: "https://www.flaticon.com/free-icon/confetti_2278992" },
];
