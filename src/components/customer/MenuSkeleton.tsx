export function MenuSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">메뉴를 불러오는 중</span>
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className="flex gap-3 rounded-[20px] border border-line bg-white p-3" aria-hidden="true">
                    <div className="size-18 rounded-xl bg-peach motion-safe:animate-pulse" />
                    <div className="flex flex-1 flex-col gap-2 py-1">
                        <div className="h-4 w-2/5 rounded bg-peach motion-safe:animate-pulse" />
                        <div className="h-3 w-4/5 rounded bg-peach motion-safe:animate-pulse" />
                        <div className="mt-auto h-4 w-1/4 rounded bg-peach motion-safe:animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}
