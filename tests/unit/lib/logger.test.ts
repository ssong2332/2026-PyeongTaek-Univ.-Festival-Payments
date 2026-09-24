import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("Architecture 7절: 로깅 규격 검증 (logger.ts)", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("로그 출력은 JSON 1줄이며 허용된 화이트리스트 필드만 직렬화한다", () => {
        logger.info("order.created", {
            requestId: "req-123",
            orderId: "550e8400-e29b-41d4-a716-446655440000",
            pickupNumber: 42,
            unknownExtraField: "should_be_stripped",
        });

        expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
        const output = consoleInfoSpy.mock.calls[0][0];
        
        // 1. JSON 유효성 검증
        const parsed = JSON.parse(output);
        expect(parsed.level).toBe("info");
        expect(parsed.event).toBe("order.created");
        expect(parsed.requestId).toBe("req-123");
        expect(parsed.pickupNumber).toBe(42);
        
        // 2. orderId 앞 8자 제한 검증 (Architecture 450행: status_token, orderId 등 앞 8자만)
        expect(parsed.orderId).toBe("550e8400");

        // 3. 화이트리스트 외 필드 제거 검증
        expect(parsed.unknownExtraField).toBeUndefined();
    });

    it("키 이름에 phone이 포함된 필드는 [redacted]로 마스킹된다 (N-17)", () => {
        logger.info("order.created", {
            phone: "010-1234-5678",
            phoneNumber: "01099998888",
        });

        const output = consoleInfoSpy.mock.calls[0][0];
        const parsed = JSON.parse(output);
        expect(parsed.phone).toBe("[redacted]");
    });

    it("logger.error는 에러 스택/원문을 통째로 노출하지 않고 code 및 message 식별자만 안전하게 직렬화한다", () => {
        const error = new Error("Database connection timeout at 10.0.0.1:5432");
        (error as unknown as { code: string }).code = "INTERNAL_ERROR";

        logger.error("api.error", error, {
            route: "/api/settings/transfer",
        });

        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        const output = consoleErrorSpy.mock.calls[0][0];
        const parsed = JSON.parse(output);

        expect(parsed.level).toBe("error");
        expect(parsed.event).toBe("api.error");
        expect(parsed.route).toBe("/api/settings/transfer");
        expect(parsed.code).toBe("INTERNAL_ERROR");
        // DB 연결 주소 원문이 통째로 노출되지 않고 에러 이름(Error)만 message에 남음
        expect(output).not.toContain("10.0.0.1:5432");
    });

    it("설정 누락 로그(settings.transfer.missing)는 warn 레벨이며 계좌번호나 민감값이 포함되지 않는다", () => {
        logger.warn("settings.transfer.missing");

        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        const output = consoleWarnSpy.mock.calls[0][0];
        const parsed = JSON.parse(output);

        expect(parsed.level).toBe("warn");
        expect(parsed.event).toBe("settings.transfer.missing");
        expect(output).not.toContain("account");
    });
});
