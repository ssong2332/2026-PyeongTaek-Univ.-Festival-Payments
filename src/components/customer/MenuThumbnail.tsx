import { HotteokMascot } from "@/components/ui/HotteokMascot";

// 메뉴 이미지. 이미지가 없으면(시드 기본값) 같은 크기의 자리표시에 마스코트를 둔다 — 목록이 밀리지 않게.
// 쓰는 곳마다 메뉴 이름이 바로 옆 글자로 있으므로 이미지는 장식(alt="")으로 둔다.
export function MenuThumbnail({ imageUrl, className = "size-18 rounded-xl" }: { imageUrl: string | null; className?: string }) {
    if (!imageUrl) {
        return (
            <div className={`flex shrink-0 items-center justify-center bg-linear-to-br from-badge to-peach ${className}`} aria-hidden="true">
                <HotteokMascot className="h-3/5 w-3/5 object-contain" />
            </div>
        );
    }
    return (
        // 관리자가 넣는 외부 이미지 URL이라 next/image 원격 도메인을 미리 정할 수 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" decoding="async" className={`shrink-0 object-cover ${className}`} />
    );
}
