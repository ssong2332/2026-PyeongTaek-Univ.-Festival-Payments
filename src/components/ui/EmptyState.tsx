import { HotteokMascot } from "./HotteokMascot";

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white px-4 py-10 text-center">
            <HotteokMascot size={56} />
            <p className="font-bold text-neutral-800">{title}</p>
            {children}
        </div>
    );
}
