import type { Metadata } from "next";
import { FESTIVAL_CREDITS } from "@/features/festival/festivalArt";

export const metadata: Metadata = { title: "이미지 출처 · 2026 평택대 축제" };

// 축제 이펙트 그림(public/festival) 출처 — Flaticon 무료 라이선스의 출처 표기 의무를 지킨다.
export default function CreditsPage() {
    return (
        <main className="min-h-screen px-4 py-8">
            <div className="mx-auto flex max-w-md flex-col gap-4">
                <h1 className="text-2xl font-bold text-dough">이미지 출처</h1>
                <p className="text-sm text-dough-dim">
                    축제 불꽃·반짝이·군중 실루엣 등 장식 그림은{" "}
                    <a href="https://www.flaticon.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-syrup underline underline-offset-2">
                        Flaticon
                    </a>
                    의 무료 아이콘을 사용했습니다.
                </p>
                <ul className="iron-card iron-solid flex flex-col divide-y divide-iron-line rounded-2xl px-4">
                    {FESTIVAL_CREDITS.map((credit) => (
                        <li key={credit.file} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                            <span className="min-w-0">
                                <span className="block truncate text-dough">{credit.title}</span>
                                <span className="block truncate text-xs text-dough-dim">
                                    {credit.author ? `Icon by ${credit.author}` : "작가: Flaticon 페이지 참조"} · flaticon.com
                                </span>
                            </span>
                            <a
                                href={credit.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-xs font-semibold text-syrup underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-syrup"
                            >
                                원본
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </main>
    );
}
