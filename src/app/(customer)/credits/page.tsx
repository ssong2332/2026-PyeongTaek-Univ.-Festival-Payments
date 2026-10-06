import type { Metadata } from "next";
import { CreditsList } from "@/components/customer/CreditsList";

export const metadata: Metadata = { title: "이미지 출처 · 2026 평택대 축제" };

// 축제 이펙트 그림 출처 화면 — 머리·목록·문구는 CreditsList(화면 언어).
export default function CreditsPage() {
    return <CreditsList />;
}
