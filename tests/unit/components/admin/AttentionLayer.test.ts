import { describe, expect, it } from "vitest";
import { orderAlert, shouldAlertNewOrder, staffAlert } from "@/components/admin/AttentionLayer";

describe("새 주문 화면 알림 대상", () => {
    it("고객 주문(source 없음·customer)은 알린다", () => {
        expect(shouldAlertNewOrder({})).toBe(true);
        expect(shouldAlertNewOrder({ source: "customer" })).toBe(true);
    });

    it("수기 주문(T-28 사후 입력)은 새 주문으로 알리지 않는다 — '#2100000001'로 오인 방지", () => {
        expect(shouldAlertNewOrder({ source: "manual" })).toBe(false);
    });
});

describe("알림 카드 문구", () => {
    it("주문: 픽업 번호 3자리, 첫 메뉴 외 N, 결제수단·금액", () => {
        const alert = orderAlert({ id: "a", pickupNumber: 45, paymentMethod: "cash", totalAmount: 7000, items: [{ menuNameKo: "기본 호떡", quantity: 2 }, { menuNameKo: "뿌링클 호떡", quantity: 1 }] });
        expect(alert).toEqual({ id: "order-a", kind: "order", title: "#045", detail: "기본 호떡 ×2 외 1 · 현금 7,000원" });
    });

    it("직원 호출: 픽업 번호 고객", () => {
        expect(staffAlert({ id: "c", pickupNumber: 7 })).toEqual({ id: "staff-c", kind: "staff", title: "#007 고객", detail: "부스로 가서 확인해 주세요" });
    });
});
