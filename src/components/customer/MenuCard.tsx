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
            className="flex w-full gap-3 rounded-[20px] border border-line bg-linear-to-b from-white to-[#fffaf7] p-3 text-left shadow-[0_10px_24px_rgba(91,55,39,0.065)] transition-transform enabled:active:scale-[0.99] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
            <MenuThumbnail imageUrl={imageUrl} className="size-18 rounded-2xl" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                    <span className="truncate text-base font-extrabold text-brand-deep">{name}</span>
                    {soldOut && (
                        <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-600">품절</span>
                    )}
                </span>
                {description && <span className="mt-1 line-clamp-2 text-xs text-stone-500">{description}</span>}
                <span className="mt-auto flex items-end justify-between pt-2">
                    <span className="text-xl font-extrabold text-brand">{formatWon(price)}</span>
                    <span
                        className="flex size-8 items-center justify-center rounded-full bg-linear-to-br from-brand-amber to-coral text-white shadow-[0_7px_16px_rgba(228,87,46,0.22)]"
                        aria-hidden="true"
                    >
                        <PlusIcon className="size-4" />
                    </span>
                </span>
            </span>
        </button>
    );
}
