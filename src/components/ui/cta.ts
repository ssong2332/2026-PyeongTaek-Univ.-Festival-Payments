// 하단 주요 행동 버튼(담기·장바구니 보기·주문하기) 모양. 버튼과 링크가 같은 모양을 쓴다.
const CTA_BASE =
    "flex h-13 w-full items-center gap-2 rounded-2xl px-5 text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep";

export const CTA_ENABLED = `${CTA_BASE} bg-linear-to-r from-brand-deep to-brand-amber text-white shadow-md`;
export const CTA_DISABLED = `${CTA_BASE} cursor-not-allowed bg-badge text-brand-deep/55`;
