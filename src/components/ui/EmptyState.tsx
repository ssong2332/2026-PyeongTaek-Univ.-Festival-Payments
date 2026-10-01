export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-100 bg-white px-4 py-10 text-center">
            <p className="font-bold text-neutral-800">{title}</p>
            {children}
        </div>
    );
}
