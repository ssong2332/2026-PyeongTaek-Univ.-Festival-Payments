"use client";

import { ArtIcon } from "@/components/ui/ArtIcon";
import type { CustomerIconName } from "@/features/customer/customerIcons";
import type { MessageKey } from "@/lib/i18n/translate";
import { useT } from "@/lib/i18n/locale";

// 축제 전광판 띠: 맛 아이콘과 문구가 오른쪽에서 왼쪽으로 끝없이 흘러간다(같은 줄을 두 번 이어 붙여 -50%까지 민다).
// 양 끝은 흐려지고, 손가락을 올리면 멈춘다. 장식이라 화면 읽기에서 숨긴다(같은 내용은 메뉴 목록에 있다).
const ITEMS: readonly { art: CustomerIconName; key: MessageKey }[] = [
    { art: "hotteok", key: "ticker.fresh" },
    { art: "fire", key: "ticker.griddle" },
    { art: "cheese", key: "ticker.cheese" },
    { art: "honey", key: "ticker.honey" },
    { art: "chili", key: "ticker.spicy" },
    { art: "seasoning", key: "ticker.seasoning" },
    { art: "coins", key: "ticker.pay" },
];

export function FlavorTicker() {
    const t = useT();
    const row = ITEMS.map((item) => (
        <span key={item.key} className="flex shrink-0 items-center gap-2 px-4">
            <ArtIcon name={item.art} size={24} className="drop-shadow-none" />
            <span className="font-display text-[15px] whitespace-nowrap text-dough">{t(item.key)}</span>
            <span className="ml-4 size-1.5 rounded-full bg-syrup/70 shadow-[0_0_8px_rgba(255,181,71,0.9)]" />
        </span>
    ));
    return (
        <div
            aria-hidden="true"
            className="group relative -mx-4 overflow-hidden border-y border-syrup/25 bg-iron-2/70 py-2.5 backdrop-blur [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]"
        >
            <div className="flex w-max motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-active:[animation-play-state:paused]">
                {row}
                {row}
            </div>
        </div>
    );
}
