// 하단 주요 행동 버튼(담기·장바구니 보기·주문하기) 모양. 버튼과 링크가 같은 모양을 쓴다.
// 흰 글자 대비: 20px 굵은 글자(큰 글자, 기준 3:1). 진한 코랄(#d9472b, 4.3:1) → 코랄(#f0612a, 3.3:1) 그라데이션이라 어느 쪽 끝도 3:1 이상(계산값).
const CTA_BASE =
    "flex h-13 w-full items-center gap-2 rounded-2xl px-5 text-xl font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep";

export const CTA_ENABLED = `${CTA_BASE} bg-linear-to-r from-brand-amber to-coral text-white shadow-[0_12px_26px_rgba(217,71,43,0.25)]`;
export const CTA_DISABLED = `${CTA_BASE} cursor-not-allowed bg-badge text-brand-deep/55`;
