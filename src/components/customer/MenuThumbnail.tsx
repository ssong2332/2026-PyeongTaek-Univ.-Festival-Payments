import { HotteokMascot } from "@/components/ui/HotteokMascot";

// 메뉴 이미지. 이미지가 없으면 같은 크기의 자리표시에 마스코트를 둔다 — 목록이 밀리지 않게.
// 쓰는 곳마다 메뉴 이름이 바로 옆 글자로 있으므로 이미지는 장식(alt="")으로 둔다.
export function MenuThumbnail({ imageUrl, className = "size-18 rounded-xl" }: { imageUrl: string | null; className?: string }) {
    if (!imageUrl) {
        return (
            <span className={`flex shrink-0 items-center justify-center bg-linear-to-br from-badge to-peach ${className}`} aria-hidden="true">
                <HotteokMascot variant="hello" className="h-4/5 w-4/5 object-contain" />
            </span>
        );
    }
    return (
        // 메뉴 사진(public/images/menu) 또는 관리자가 넣는 외부 URL — 원격 도메인을 미리 정할 수 없어 img를 쓴다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" decoding="async" draggable={false} className={`block shrink-0 bg-peach object-cover ${className}`} />
    );
}
