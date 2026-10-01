// 하단 주요 행동 버튼(담기·장바구니 보기·주문하기) 모양. 버튼과 링크가 같은 모양을 쓴다.
// 흰 글자 대비: 20px 굵은 글자(큰 글자, 기준 3:1)로 두고, 그라데이션 끝을 130%까지 늘려 오른쪽 끝도 약 3.6:1이 되게 했다(계산 추정).
const CTA_BASE =
    "flex h-13 w-full items-center gap-2 rounded-2xl px-5 text-xl font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep";

export const CTA_ENABLED = `${CTA_BASE} bg-linear-to-r from-brand-deep to-brand-amber to-130% text-white shadow-md`;
export const CTA_DISABLED = `${CTA_BASE} cursor-not-allowed bg-badge text-brand-deep/55`;
