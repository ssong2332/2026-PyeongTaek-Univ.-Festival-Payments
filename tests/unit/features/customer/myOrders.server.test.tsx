import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { forgetMyOrder, readMyOrders, saveMyOrder, useMyOrders } from "@/features/customer/myOrders";

// node 환경(window 없음) — 서버 렌더링 중에 불려도 저장소에 손대지 않고 빈 목록으로 동작해야 한다.
describe("myOrders — 서버 렌더링(window 없음)", () => {
    it("읽기는 빈 목록, 저장·삭제는 예외 없이 아무것도 하지 않는다", () => {
        expect(typeof window).toBe("undefined");
        expect(readMyOrders()).toEqual([]);
        expect(() => saveMyOrder({ statusToken: "a".repeat(64), pickupNumber: 1 })).not.toThrow();
        expect(() => forgetMyOrder("a".repeat(64))).not.toThrow();
    });

    it("useMyOrders는 서버 HTML에서 빈 목록이다(하이드레이션 기준값)", () => {
        function Probe() {
            return <p>{useMyOrders().length}</p>;
        }

        expect(renderToString(<Probe />)).toBe("<p>0</p>");
    });
});
