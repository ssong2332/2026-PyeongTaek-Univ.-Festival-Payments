// 화면 아래 고정 행동 바(메뉴판·장바구니·결제 공통). 본문 아래 여백은 고객 레이아웃 푸터가 확보한다.
export function BottomBar({ children }: { children: React.ReactNode }) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-30">
            <div className="mx-auto max-w-md bg-linear-to-t from-iron via-iron/95 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {children}
            </div>
        </div>
    );
}
