import { AlertIcon, RetryIcon } from "./icons";

export function ErrorRetry({ message, onRetry, retryLabel = "다시 시도" }: { message: string; onRetry: () => void; retryLabel?: string }) {
    return (
        <div role="alert" className="iron-card flex flex-col items-center gap-3 rounded-3xl px-4 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-chili/15 text-chili">
                <AlertIcon className="size-6" />
            </span>
            <p className="font-bold text-dough">{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className="group inline-flex items-center gap-1.5 rounded-full border border-iron-line bg-iron px-5 py-2.5 text-sm font-bold text-dough transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
            >
                <RetryIcon className="size-4 text-syrup transition-transform duration-500 group-hover:rotate-180" />
                {retryLabel}
            </button>
        </div>
    );
}
