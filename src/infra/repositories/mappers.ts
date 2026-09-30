import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import { CreateOrderResponseSchema, type CreateOrderResponse } from "@/lib/dto/order";
import type { OrderByTokenResult, OrderForTransition, OrderItemDetail } from "@/services/ports";

type OrderRow = { id: string; status: OrderStatus; payment_method: PaymentMethod };

// DB 행 → 서비스 타입. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
export function toOrderForTransition(row: OrderRow): OrderForTransition {
  return { id: row.id, status: row.status, paymentMethod: row.payment_method };
}

// DB 시각(+09:00 등) → UTC ISO 문자열. 해석할 수 없으면 원래 값을 두어 스키마 검사에서 걸리게 한다.
function toUtcIso(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

// DB 결과 → API DTO. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
// 모양 검사는 프론트와 같은 계약(CreateOrderResponseSchema)으로 한다. 어긋나면 일반 Error → 500(내용 비노출).
export function toCreateOrderResponse(data: unknown): CreateOrderResponse {
  const row = (data ?? {}) as Record<string, unknown>;
  const parsed = CreateOrderResponseSchema.safeParse({
    orderId: row.orderId,
    pickupNumber: row.pickupNumber,
    statusToken: row.statusToken,
    status: row.status,
    totalAmount: row.totalAmount,
    createdAt: toUtcIso(row.createdAt),
    created: row.created,
  });
  if (!parsed.success) throw new Error("create_order returned an unexpected shape");
  return parsed.data;
}

type OrderResponseRow = {
  id: string;
  pickup_number: number;
  status_token: string;
  status: string;
  total_amount: number;
  created_at: string;
};

// 멱등키 선조회 결과(orders 행) → 기존 주문 응답(created=false).
export function toExistingOrderResponse(row: OrderResponseRow): CreateOrderResponse {
  return toCreateOrderResponse({
    orderId: row.id,
    pickupNumber: row.pickup_number,
    statusToken: row.status_token,
    status: row.status,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
    created: false,
  });
}

interface DbOrderItemOptionSnapshot {
  option_name_ko: string;
  option_name_en: string | null;
}

interface DbOrderItemSnapshot {
  menu_name_ko: string;
  menu_name_en: string | null;
  quantity: number;
  line_total: number;
  sort_order: number;
  order_item_options?: DbOrderItemOptionSnapshot[];
}

interface DbOrderByTokenRow {
  id: string;
  pickup_number: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  total_amount: number;
  locale: string;
  created_at: string;
  transfer_reported_at: string | null;
  cancel_requested_at: string | null;
  cancel_rejected_at: string | null;
  order_items?: DbOrderItemSnapshot[];
}

export function toOrderByTokenResult(data: unknown): OrderByTokenResult {
  const row = data as DbOrderByTokenRow;
  const locale = row.locale ?? "ko";
  const rawItems = row.order_items ?? [];
  const sortedItems = [...rawItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const items: OrderItemDetail[] = sortedItems.map((item) => {
    const name = locale === "en" && item.menu_name_en ? item.menu_name_en : item.menu_name_ko;
    const options = (item.order_item_options ?? []).map((opt) =>
      locale === "en" && opt.option_name_en ? opt.option_name_en : opt.option_name_ko,
    );
    return {
      name,
      quantity: item.quantity,
      options,
      lineTotal: item.line_total,
    };
  });

  return {
    id: row.id,
    pickupNumber: row.pickup_number,
    status: row.status,
    paymentMethod: row.payment_method,
    totalAmount: row.total_amount,
    items,
    createdAt: row.created_at,
    transferReportedAt: row.transfer_reported_at,
    cancelRequestedAt: row.cancel_requested_at,
    cancelRejectedAt: row.cancel_rejected_at,
  };
}

import type {
  MenuItemRecord,
  MenuNameTranslation,
  MenuOptionGroupRecord,
  MenuOptionRecord,
} from "@/services/ports";

interface DbNameTranslationRow {
  locale: string;
  name: string;
}

interface DbMenuItemTranslationRow extends DbNameTranslationRow {
  description?: string | null;
}

interface DbMenuOptionRow {
  id: string;
  extra_price: number;
  sort_order: number;
  is_active: boolean;
  option_translations?: DbNameTranslationRow[] | null;
}

interface DbMenuOptionGroupRow {
  id: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  option_group_translations?: DbNameTranslationRow[] | null;
  options?: DbMenuOptionRow[] | null;
}

interface DbMenuItemRow {
  id: string;
  base_price: number;
  stock: number;
  is_sold_out_manual: boolean;
  is_active: boolean;
  sort_order: number;
  image_url?: string | null;
  menu_item_translations?: DbMenuItemTranslationRow[] | null;
  option_groups?: DbMenuOptionGroupRow[] | null;
}

function toMenuNameTranslations(rows: DbNameTranslationRow[] | null | undefined): MenuNameTranslation[] {
  return (rows ?? []).map((row) => ({ locale: row.locale, name: row.name }));
}

function toMenuOptionRecord(row: DbMenuOptionRow): MenuOptionRecord {
  return {
    id: row.id,
    extraPrice: row.extra_price,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    translations: toMenuNameTranslations(row.option_translations),
  };
}

function toMenuOptionGroupRecord(row: DbMenuOptionGroupRow): MenuOptionGroupRecord {
  return {
    id: row.id,
    minSelect: row.min_select,
    maxSelect: row.max_select,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    translations: toMenuNameTranslations(row.option_group_translations),
    options: (row.options ?? []).map(toMenuOptionRecord),
  };
}

// menu_items 임베드 조회 행 → 메뉴 포트 레코드. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
export function toMenuItemRecord(data: unknown): MenuItemRecord {
  const row = data as DbMenuItemRow;
  return {
    id: row.id,
    basePrice: row.base_price,
    stock: row.stock,
    isSoldOutManual: row.is_sold_out_manual,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    imageUrl: row.image_url ?? null,
    translations: (row.menu_item_translations ?? []).map((translation) => ({
      locale: translation.locale,
      name: translation.name,
      description: translation.description ?? null,
    })),
    optionGroups: (row.option_groups ?? []).map(toMenuOptionGroupRecord),
  };
}
