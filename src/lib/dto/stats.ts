import { z } from "zod";
import { ORDER_STATUSES } from "@/domain/order/status";

const count = z.number().int().nonnegative();

export const StatsDtoSchema = z.object({
    date: z.string(),
    sales: count,
    orderCount: count,
    refundedAmount: count,
    refundedCount: count,
    byMenu: z.array(z.object({
        menuItemId: z.string().uuid(),
        nameKo: z.string(),
        quantity: count,
        ratio: z.number().min(0).max(1),
    })),
    totals: z.record(z.enum(ORDER_STATUSES), count),
});

export type StatsDto = z.infer<typeof StatsDtoSchema>;
