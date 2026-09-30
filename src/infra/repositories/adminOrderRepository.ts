import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { AdminOrderRepository, OrderListFilter } from "@/services/ports";
import type { AdminOrderDto, AdminOrderItemDto } from "@/lib/dto/adminOrder";
import { availableActions } from "@/domain/order/stateMachine";
import type { OrderStatus, PaymentMethod, RefundChannel } from "@/domain/order/status";

interface DbOrderItemOption {
    option_name_ko: string;
    extra_price: number;
}

interface DbOrderItem {
    menu_name_ko: string;
    quantity: number;
    line_total: number;
    order_item_options: DbOrderItemOption[];
}

interface DbStatusHistory {
    reason: string | null;
    created_at: string;
}

interface DbOrderRow {
    id: string;
    pickup_number: number;
    status: OrderStatus;
    payment_method: PaymentMethod;
    total_amount: number;
    created_at: string;
    updated_at: string;
    acknowledged_at: string | null;
    transfer_reported_at: string | null;
    cancel_requested_at: string | null;
    cancel_rejected_at: string | null;
    paid_at: string | null;
    cooking_started_at: string | null;
    completed_at: string | null;
    closed_at: string | null;
    refund_channel: RefundChannel | null;
    order_items?: DbOrderItem[];
    order_status_history?: DbStatusHistory[];
}

export function toAdminOrderDto(row: DbOrderRow): AdminOrderDto {
    const items: AdminOrderItemDto[] = (row.order_items ?? []).map((item) => ({
        menuNameKo: item.menu_name_ko,
        quantity: item.quantity,
        lineTotal: item.line_total,
        options: (item.order_item_options ?? []).map((opt) => ({
            nameKo: opt.option_name_ko,
            extraPrice: opt.extra_price,
        })),
    }));

    const sortedHistory = [...(row.order_status_history ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const lastReason = sortedHistory[0]?.reason ?? null;

    return {
        id: row.id,
        pickupNumber: row.pickup_number,
        status: row.status,
        paymentMethod: row.payment_method,
        totalAmount: row.total_amount,
        items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        acknowledgedAt: row.acknowledged_at,
        transferReportedAt: row.transfer_reported_at,
        cancelRequestedAt: row.cancel_requested_at,
        cancelRejectedAt: row.cancel_rejected_at,
        paidAt: row.paid_at,
        cookingStartedAt: row.cooking_started_at,
        completedAt: row.completed_at,
        closedAt: row.closed_at,
        refundChannel: row.refund_channel,
        lastReason,
        availableActions: availableActions({
            status: row.status,
            paymentMethod: row.payment_method,
        }),
    };
}

const ORDER_QUERY_SELECT = `
    id, pickup_number, status, payment_method, total_amount,
    created_at, updated_at, acknowledged_at, transfer_reported_at,
    cancel_requested_at, cancel_rejected_at, paid_at, cooking_started_at,
    completed_at, closed_at, refund_channel,
    order_items (
        menu_name_ko, quantity, line_total,
        order_item_options ( option_name_ko, extra_price )
    ),
    order_status_history ( reason, created_at )
`;

export class SupabaseAdminOrderRepository implements AdminOrderRepository {
    private readonly client: SupabaseClient;

    constructor(client?: SupabaseClient) {
        this.client = client ?? createServiceClient();
    }

    async findById(id: string): Promise<AdminOrderDto | null> {
        const { data, error } = await this.client
            .from("orders")
            .select(ORDER_QUERY_SELECT)
            .eq("id", id)
            .maybeSingle();

        if (error) {
            throw new AppError("INTERNAL_ERROR", 500);
        }

        if (!data) return null;
        return toAdminOrderDto(data as unknown as DbOrderRow);
    }

    async list(filter?: OrderListFilter): Promise<AdminOrderDto[]> {
        let query = this.client
            .from("orders")
            .select(ORDER_QUERY_SELECT)
            .order("created_at", { ascending: false });

        if (filter?.pickupNumber !== undefined) {
            // F-22: pickupNumber 지정 시 date 무시
            query = query.eq("pickup_number", filter.pickupNumber);
        } else if (filter?.date) {
            // KST 날짜 기준 범위 필터
            const startUtc = new Date(`${filter.date}T00:00:00+09:00`).toISOString();
            const endUtc = new Date(`${filter.date}T23:59:59.999+09:00`).toISOString();
            query = query.gte("created_at", startUtc).lte("created_at", endUtc);
        }

        if (filter?.status && filter.status.length > 0) {
            query = query.in("status", filter.status);
        }

        const { data, error } = await query;
        if (error) {
            throw new AppError("INTERNAL_ERROR", 500);
        }

        return ((data as unknown as DbOrderRow[]) ?? []).map(toAdminOrderDto);
    }

    async acknowledge(id: string, actorId?: string): Promise<AdminOrderDto> {
        const now = new Date().toISOString();
        const updatePayload: { acknowledged_at: string; acknowledged_by?: string } = {
            acknowledged_at: now,
        };
        if (actorId) {
            updatePayload.acknowledged_by = actorId;
        }

        const { error } = await this.client
            .from("orders")
            .update(updatePayload)
            .eq("id", id);

        if (error) {
            throw new AppError("INTERNAL_ERROR", 500);
        }

        const updated = await this.findById(id);
        if (!updated) {
            throw new AppError("NOT_FOUND", 404);
        }
        return updated;
    }
}
