// 장바구니·결제 화면 머리(뒤로 + 제목). 뒤로 링크는 화면(app)이 만들어 넘긴다 — 이 컴포넌트는 라우터를 모른다.
export const BACK_LINK_CLASS =
    "flex size-10 shrink-0 items-center justify-center rounded-xl bg-peach text-orange-700 focus-visible:outline-2 focus-visible:outline-brand";

export function PageHeader({ title, back, right }: { title: string; back: React.ReactNode; right?: React.ReactNode }) {
    return (
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
            {back}
            <h1 className="flex-1 text-lg font-extrabold text-neutral-900">{title}</h1>
            {right}
        </header>
    );
}
