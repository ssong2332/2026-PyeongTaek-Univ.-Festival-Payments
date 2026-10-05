// 하단 주요 행동 버튼(담기·장바구니 보기·주문하기) 모양. 버튼과 링크가 같은 모양을 쓴다.
// 시럽 그라데이션 위 당밀색 글씨(#3b1a08) — 가장 어두운 끝(#f08a2c)에서도 대비 6:1 이상(계산값).
const CTA_BASE =
    "flex h-14 w-full items-center gap-3 rounded-[18px] px-5 text-[17px] font-bold transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-syrup";

export const CTA_ENABLED = `${CTA_BASE} syrup-btn syrup-flow sheen active:scale-[0.97]`;
export const CTA_DISABLED = `${CTA_BASE} cursor-not-allowed justify-center border border-iron-line bg-iron-2 text-dough-dim`;
