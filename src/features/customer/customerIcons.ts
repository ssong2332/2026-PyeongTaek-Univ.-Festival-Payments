import type { FestivalCredit } from "@/features/festival/festivalArt";

// 고객 화면 일러스트 아이콘 — Flaticon 무료 아이콘(Magnific·Flat 한 화풍으로 통일). 512px PNG를 256px WebP로 줄여 public/icons에 둔다.
// 출처는 /credits 화면에 FESTIVAL_CREDITS와 함께 보인다.
const icon = (name: string) => `/icons/${name}.webp`;

export const CUSTOMER_ICONS = {
    hotteok: icon("hotteok"),
    cheese: icon("cheese"),
    honey: icon("honey"),
    chili: icon("chili"),
    seasoning: icon("seasoning"),
    bag: icon("bag"),
    search: icon("search"),
    pan: icon("pan"),
    megaphone: icon("megaphone"),
    coins: icon("coins"),
    bank: icon("bank"),
    banknote: icon("banknote"),
    hourglass: icon("hourglass"),
    receipt: icon("receipt"),
    warning: icon("warning"),
    closed: icon("closed"),
    takeout: icon("takeout"),
    bell: icon("bell"),
    fire: icon("fire"),
} as const;
export type CustomerIconName = keyof typeof CUSTOMER_ICONS;

const credit = (name: CustomerIconName, title: string, slug: string, id: number): FestivalCredit => ({
    file: name,
    src: CUSTOMER_ICONS[name],
    title,
    author: "Magnific",
    url: `https://www.flaticon.com/free-icon/${slug}_${id}`,
});

export const CUSTOMER_ICON_CREDITS: readonly FestivalCredit[] = [
    credit("hotteok", "Pancake", "pancake", 454579),
    credit("cheese", "Cheese", "cheese", 836583),
    credit("honey", "Honey", "honey", 1047905),
    credit("chili", "Chili", "chili", 2156631),
    credit("seasoning", "Spices", "spices", 2448372),
    credit("bag", "Shopping bag", "shopping-bag", 9368624),
    credit("search", "Magnifying glass", "magnifying-glass", 3721591),
    credit("pan", "Pan", "pan", 2702519),
    credit("megaphone", "Megaphone", "megaphone", 517984),
    credit("coins", "Coins", "coins", 566445),
    credit("bank", "Bank", "bank", 924879),
    credit("banknote", "Money", "money", 2454274),
    credit("hourglass", "Hourglass", "hourglass", 3073440),
    credit("receipt", "Receipt", "receipt", 869443),
    credit("warning", "Warning", "warning", 595067),
    credit("closed", "Close", "close", 2169997),
    credit("takeout", "Takeaway", "takeaway", 2702578),
    credit("bell", "Notification", "notification", 2058148),
    credit("fire", "Fire", "fire", 785116),
];
