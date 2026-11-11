"use client";

import { motion } from "motion/react";
import type { PaymentMethod } from "@/domain/order/status";
import { CelebrationBurst } from "@/features/festival/CelebrationBurst";
import type { OrderStatusItemDto } from "@/lib/dto/order";
import { useT } from "@/lib/i18n/locale";
import { BrandedPickup } from "./BrandedPickup";
import { ReceiptPrinter } from "./ReceiptPrinter";

// 주문 완료 보기: 제목 → 인두로 새긴 픽업 번호 → 영수증 출력·"접수완료" 도장. 인두가 찍힌 직후 양쪽에서 축하 폭죽이 터진다.
export function OrderCompleteCard({
  pickupNumber,
  totalAmount,
  paymentMethod,
  items = [],
  createdAt,
}: {
  pickupNumber: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  items?: readonly OrderStatusItemDto[];
  createdAt?: string;
}) {
  const t = useT();
  return (
    <>
      <motion.h1
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="font-display text-center text-3xl text-dough"
      >
        {t("complete.titleBefore")}
        <span className="text-syrup">{t("complete.titleHighlight")}</span>
        {t("complete.titleAfter")}
      </motion.h1>
      <BrandedPickup pickupNumber={pickupNumber} />
      <ReceiptPrinter totalAmount={totalAmount} paymentMethod={paymentMethod} items={items} createdAt={createdAt} />
      <CelebrationBurst delay={0.9} />
    </>
  );
}
