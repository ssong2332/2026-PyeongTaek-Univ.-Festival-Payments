import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import { kstDayUtcRange } from "./aggregate";

export const FESTIVAL_DATES = { from: "2026-10-07", to: "2026-10-08" } as const;

export const CSV_HEADERS = [
    "주문 ID", "픽업 번호", "주문 시각", "메뉴", "옵션", "수량", "금액",
    "결제수단", "상태", "취소/환불 사유", "주문 합계", "결제확인 시각", "완료 시각",
] as const;

export interface CsvOrderItem {
    menuNameKo: string;
    options: readonly string[];
    quantity: number;
    lineTotal: number;
}

export interface CsvOrder {
    id: string;
    pickupNumber: number;
    createdAt: string;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    totalAmount: number;
    reason: string | null;
    paidAt: string | null;
    completedAt: string | null;
    items: readonly CsvOrderItem[];
}

export interface CsvDateRange {
    from: string;
    to: string;
}

export interface OrdersCsvResult {
    content: string;
    sales: number;
    rowCount: number;
}

const salesStatuses = new Set<OrderStatus>(["paid", "cooking", "completed"]);
const statusLabels: Record<OrderStatus, string> = {
    pending: "결제대기", paid: "결제확인", cooking: "조리중", completed: "완료",
    cancelled: "취소", refunded: "환불", expired: "만료",
};
const paymentLabels: Record<PaymentMethod, string> = { cash: "현금", transfer: "계좌이체" };
const kstOffsetMs = 9 * 60 * 60 * 1000;

function kstTimestamp(value: string | null): string {
    if (value === null) return "";
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new RangeError(`Invalid timestamp: ${value}`);
    return new Date(timestamp + kstOffsetMs).toISOString().slice(0, 19).replace("T", " ");
}

function csvCell(value: string | number): string {
    let text = String(value);
    // Quoting alone does not prevent spreadsheet applications from evaluating formulas.
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function assertAmount(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${field} must be a non-negative safe integer`);
    }
}

/** DECISIONS #20: one CSV row per order item; only paid/cooking/completed rows count as sales. */
export function buildOrdersCsv(
    orders: readonly CsvOrder[],
    range: CsvDateRange = FESTIVAL_DATES,
): OrdersCsvResult {
    const start = Date.parse(kstDayUtcRange(range.from).start);
    const end = Date.parse(kstDayUtcRange(range.to).end);
    if (start >= end) throw new RangeError("from must not be after to");

    const rows: string[] = [CSV_HEADERS.join(",")];
    let sales = 0;
    let rowCount = 0;

    for (const order of orders) {
        const created = Date.parse(order.createdAt);
        if (!Number.isFinite(created)) throw new RangeError(`Invalid timestamp: ${order.createdAt}`);
        if (created < start || created >= end) continue;

        if (!Number.isSafeInteger(order.pickupNumber) || order.pickupNumber < 1) {
            throw new RangeError("pickupNumber must be a positive safe integer");
        }
        assertAmount(order.totalAmount, "totalAmount");
        const itemTotal = order.items.reduce((sum, item) => {
            assertAmount(item.lineTotal, "lineTotal");
            if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
                throw new RangeError("quantity must be a positive safe integer");
            }
            return sum + item.lineTotal;
        }, 0);
        assertAmount(itemTotal, "itemTotal");
        if (itemTotal !== order.totalAmount) {
            throw new RangeError(`Order item total mismatch: ${order.id}`);
        }

        for (const item of order.items) {
            rows.push([
                order.id, order.pickupNumber, kstTimestamp(order.createdAt), item.menuNameKo,
                item.options.join(";"), item.quantity, item.lineTotal,
                paymentLabels[order.paymentMethod], statusLabels[order.status],
                order.status === "cancelled" || order.status === "refunded" ? order.reason ?? "" : "",
                order.totalAmount, kstTimestamp(order.paidAt), kstTimestamp(order.completedAt),
            ].map(csvCell).join(","));
            rowCount++;
            if (salesStatuses.has(order.status)) {
                sales += item.lineTotal;
                assertAmount(sales, "sales");
            }
        }
    }

    return { content: `\uFEFF${rows.join("\r\n")}\r\n`, sales, rowCount };
}
