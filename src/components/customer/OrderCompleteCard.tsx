"use client";

import { motion } from "motion/react";
import type { PaymentMethod } from "@/domain/order/status";
import type { OrderStatusItemDto } from "@/lib/dto/order";
import { BrandedPickup } from "./BrandedPickup";
import { ReceiptPrinter } from "./ReceiptPrinter";

// 주문 완료 보기: 제목 → 인두로 새긴 픽업 번호 → 영수증 출력·"접수완료" 도장.
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
  return (
    <>
      <motion.h1
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="font-display text-center text-3xl text-dough"
      >
        주문이 <span className="text-syrup">접수</span>됐어요!
      </motion.h1>
      <BrandedPickup pickupNumber={pickupNumber} />
      <ReceiptPrinter totalAmount={totalAmount} paymentMethod={paymentMethod} items={items} createdAt={createdAt} />
    </>
  );
}
