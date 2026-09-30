export function ErrorRetry({ message, onRetry, retryLabel = "다시 시도" }: { message: string; onRetry: () => void; retryLabel?: string }) {
    return (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-orange-100 bg-white px-4 py-8 text-center">
            <p className="font-bold text-neutral-800">{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
            >
                {retryLabel}
            </button>
        </div>
    );
}
