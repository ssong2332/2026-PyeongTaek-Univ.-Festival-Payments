"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SPRING, SPRING_BOUNCY } from "@/components/motion/presets";
import { SendIcon, StarIcon } from "@/components/ui/icons";
import { REVIEW_TEXT_MAX, reviewTextLength, useReview } from "@/features/customer/useReview";
import { useT } from "@/lib/i18n/locale";

const CARD = "iron-card rounded-3xl p-5";
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup";
// 별점별 한마디는 사전 review.rating.1~5
const RATING_KEYS = ["review.rating.1", "review.rating.2", "review.rating.3", "review.rating.4", "review.rating.5"] as const;

// T-41 (F-37): 완료 주문의 상태 페이지 후기 폼 — 별점 1~5(필수), 한 줄 후기 200자(선택). 제출 후 비활성 + "후기가 등록되었습니다".
export function ReviewForm({ token }: { token: string }) {
  const t = useT();
  const review = useReview(token);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const length = reviewTextLength(text);

  if (review.submitted) {
    return (
      <motion.section
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_BOUNCY}
        role="status"
        aria-labelledby="review-heading"
        className={`${CARD} flex items-center gap-3 bg-linear-to-br from-iron-3 to-iron-2`}
      >
        <div>
          <h2 id="review-heading" className="font-display text-xl text-dough">
            {t("review.done.title")}
          </h2>
          <p className="mt-0.5 text-sm text-dough-dim">{t("review.done.body")}</p>
        </div>
      </motion.section>
    );
  }

  return (
    <section aria-labelledby="review-heading" className={CARD}>
      <div className="flex items-center gap-3">
        <div>
          <h2 id="review-heading" className="font-display text-xl text-dough">
            {t("review.title")}
          </h2>
          <p className="text-xs text-dough-dim">{t("review.prompt")}</p>
        </div>
      </div>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (rating > 0 && length <= REVIEW_TEXT_MAX) review.submit(rating, text);
        }}
      >
        <fieldset>
          <legend className="sr-only">{t("review.rating")}</legend>
          <div role="radiogroup" aria-label={t("review.rating")} className="flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = value <= rating;
              return (
                <motion.label
                  key={value}
                  whileTap={{ scale: 0.8 }}
                  animate={filled ? { scale: [1, 1.35, 1], rotate: [0, -15, 0] } : { scale: 1, rotate: 0 }}
                  transition={{ duration: 0.35, delay: filled ? (value - 1) * 0.04 : 0 }}
                  className="cursor-pointer rounded-full p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand"
                >
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                    aria-label={t("review.ratingValue", { value })}
                    className="sr-only"
                  />
                  <span className={filled ? "text-[#ffb400] drop-shadow-[0_3px_6px_rgba(255,180,0,0.45)]" : "text-dough-dim/35"}>
                    <StarIcon className={`size-9 ${filled ? "fill-current" : ""}`} strokeWidth={1.8} />
                  </span>
                </motion.label>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            {rating > 0 && (
              <motion.p
                key={rating}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SPRING}
                className="mt-1 text-center text-sm font-bold text-syrup"
              >
                {rating > 0 ? t(RATING_KEYS[rating - 1]) : ""}
              </motion.p>
            )}
          </AnimatePresence>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="sr-only">{t("review.textLabel")}</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            placeholder={t("review.placeholder")}
            className="resize-none rounded-2xl border border-iron-line bg-iron px-4 py-3 text-sm text-dough outline-none placeholder:text-dough-dim focus:border-syrup focus:ring-4 focus:ring-syrup/15"
          />
          <span className={`self-end text-xs ${length > REVIEW_TEXT_MAX ? "font-bold text-chili" : "text-dough-dim"}`}>
            {length}/{REVIEW_TEXT_MAX}
          </span>
        </label>

        <button
          type="submit"
          disabled={rating === 0 || length > REVIEW_TEXT_MAX || review.submitting}
          className={`cta-shine flex h-12 items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-brand-amber to-coral font-bold text-white shadow-[0_10px_22px_rgba(217,71,43,0.25)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-iron-3 disabled:text-dough disabled:shadow-none ${FOCUS_RING}`}
        >
          <SendIcon className="size-4" />
          {review.submitting ? t("review.sending") : t("review.submit")}
        </button>
        {review.error && (
          <p role="alert" className="text-sm text-chili">
            {review.error === "notAllowed" ? t("review.notAllowed") : t("review.failed")}
          </p>
        )}
      </form>
    </section>
  );
}
