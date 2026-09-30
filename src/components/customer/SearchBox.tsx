import { CloseIcon, SearchIcon } from "@/components/ui/icons";

export function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="flex items-center gap-2 rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm focus-within:border-brand">
            <SearchIcon className="size-5 text-brand-amber" />
            <label htmlFor="menu-search" className="sr-only">
                메뉴 검색
            </label>
            <input
                id="menu-search"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="메뉴 검색"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-base text-neutral-900 outline-none placeholder:text-stone-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {value !== "" && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="검색어 지우기"
                    className="flex size-7 items-center justify-center rounded-full text-stone-400 focus-visible:outline-2 focus-visible:outline-brand"
                >
                    <CloseIcon className="size-4" />
                </button>
            )}
        </div>
    );
}
