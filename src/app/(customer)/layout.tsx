import Link from "next/link";

// 고객 화면 공통 틀(모바일 폭). 화면별 머리는 각 페이지가 그린다(디자인 캡처 01·07·08).
// 푸터 아래 여백은 하단 고정 행동 바(BottomBar)에 본문이 가리지 않게 하는 몫이다.
export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="min-h-dvh bg-cream text-neutral-900">
            <div className="mx-auto flex min-h-dvh max-w-md flex-col">
                <div className="flex-1">{children}</div>
                <footer className="px-4 pt-8 pb-32 text-center text-xs text-stone-500">
                    <Link href="/privacy" className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand">
                        개인정보 안내
                    </Link>
                </footer>
            </div>
        </div>
    );
}
