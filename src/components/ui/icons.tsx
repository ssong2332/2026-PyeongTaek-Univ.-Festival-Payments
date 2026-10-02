// 장식용 선 아이콘. 의미는 항상 옆의 글자나 aria-label이 전달한다.
type IconProps = { className?: string };

function Svg({ className = "size-5", children }: IconProps & { children: React.ReactNode }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {children}
        </svg>
    );
}

export function CartIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <circle cx="9" cy="20" r="1" />
            <circle cx="18" cy="20" r="1" />
            <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 7H6" />
        </Svg>
    );
}

export function ClockIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </Svg>
    );
}

export function SearchIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </Svg>
    );
}

export function CloseIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M6 6l12 12M18 6 6 18" />
        </Svg>
    );
}

export function ChevronLeftIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="m15 18-6-6 6-6" />
        </Svg>
    );
}

export function ArrowRightIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M5 12h14M13 6l6 6-6 6" />
        </Svg>
    );
}

export function PlusIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 5v14M5 12h14" />
        </Svg>
    );
}

export function MinusIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M5 12h14" />
        </Svg>
    );
}

export function CheckIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="m5 12 5 5 9-10" />
        </Svg>
    );
}

export function CashIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2.5" />
        </Svg>
    );
}

export function BankIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3 3 8h18z" />
        </Svg>
    );
}
