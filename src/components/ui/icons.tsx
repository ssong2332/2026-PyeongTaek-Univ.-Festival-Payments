import {
    ArrowRight,
    Ban,
    Banknote,
    BellRing,
    Check,
    ChefHat,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    Clock3,
    Copy,
    ExternalLink,
    CreditCard,
    Flame,
    Heart,
    Image as ImageGlyph,
    Info,
    Landmark,
    Minus,
    PartyPopper,
    Plus,
    Receipt,
    RefreshCw,
    Search,
    Send,
    ShieldCheck,
    ShoppingBag,
    Smartphone,
    Sparkles,
    Star,
    Trash2,
    TriangleAlert,
    Utensils,
    X,
    type LucideIcon,
} from "lucide-react";

// 고객 화면 공통 아이콘 — 모두 lucide 한 세트(둥근 끝·굵기 2.25)로 맞춘다. 이모지·OS 기본 기호는 쓰지 않는다.
// 장식용이라 숨기고, 의미는 항상 옆의 글자나 aria-label이 전달한다.
type IconProps = { className?: string; strokeWidth?: number };

function wrap(Icon: LucideIcon, defaultClass = "size-5") {
    function AppIcon({ className = defaultClass, strokeWidth = 2.25 }: IconProps) {
        return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" />;
    }
    return AppIcon;
}

export const CartIcon = wrap(ShoppingBag);
export const ClockIcon = wrap(Clock3);
export const SearchIcon = wrap(Search);
export const CloseIcon = wrap(X);
export const ChevronLeftIcon = wrap(ChevronLeft, "size-6");
export const ArrowRightIcon = wrap(ArrowRight);
export const PlusIcon = wrap(Plus);
export const MinusIcon = wrap(Minus);
export const CheckIcon = wrap(Check);
export const CashIcon = wrap(Banknote);
export const BankIcon = wrap(Landmark);
export const SparkleIcon = wrap(Sparkles);
export const StarIcon = wrap(Star);
export const ReceiptIcon = wrap(Receipt);
export const CardIcon = wrap(CreditCard);
export const FlameIcon = wrap(Flame);
export const PartyIcon = wrap(PartyPopper);
export const CopyIcon = wrap(Copy);
export const DoneIcon = wrap(CircleCheck);
export const BanIcon = wrap(Ban);
export const HeartIcon = wrap(Heart);
export const InfoIcon = wrap(Info);
export const RetryIcon = wrap(RefreshCw);
export const AlertIcon = wrap(TriangleAlert);
export const SendIcon = wrap(Send);
export const BellIcon = wrap(BellRing);
export const ChefIcon = wrap(ChefHat);
export const UtensilsIcon = wrap(Utensils);
export const ChevronRightIcon = wrap(ChevronRight);
export const ExternalLinkIcon = wrap(ExternalLink);
export const ImageIcon = wrap(ImageGlyph);
export const ShieldIcon = wrap(ShieldCheck);
export const PhoneIcon = wrap(Smartphone);
export const TrashIcon = wrap(Trash2);
