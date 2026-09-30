import { formatWon } from "@/lib/format";
import { PlusIcon } from "@/components/ui/icons";
import { MenuThumbnail } from "./MenuThumbnail";

export interface MenuCardProps {
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    soldOut: boolean;
    onSelect: () => void;
}

export function MenuCard({ name, description, price, imageUrl, soldOut, onSelect }: MenuCardProps) {
    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={soldOut}
            className="flex w-full gap-3 rounded-[20px] border border-orange-100 bg-white p-3 text-left shadow-sm transition-transform enabled:active:scale-[0.99] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
            <MenuThumbnail imageUrl={imageUrl} />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                    <span className="truncate text-base font-bold text-neutral-900">{name}</span>
                    {soldOut && (
                        <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-600">품절</span>
                    )}
                </span>
                {description && <span className="mt-1 line-clamp-2 text-xs text-stone-500">{description}</span>}
                <span className="mt-auto flex items-end justify-between pt-2">
                    <span className="text-lg font-extrabold text-brand">{formatWon(price)}</span>
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
                        <PlusIcon className="size-4" />
                    </span>
                </span>
            </span>
        </button>
    );
}
