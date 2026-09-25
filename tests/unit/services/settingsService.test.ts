import { describe, expect, it, vi } from "vitest";
import { getTransferSettings } from "@/services/settingsService";
import { SettingsRepository } from "@/services/ports";
import { TRANSFER_SETTING_KEYS } from "@/lib/dto/settings";
import type { Logger } from "@/lib/logger";
import fs from "node:fs";
import path from "node:path";

class FakeSettingsRepository implements SettingsRepository {
    private data: Record<string, string>;

    constructor(initialData: Record<string, string> = {}) {
        this.data = { ...initialData };
    }

    async get(key: string): Promise<string | null> {
        return this.data[key] ?? null;
    }

    async getAll(): Promise<Record<string, string>> {
        return { ...this.data };
    }

    async getByPrefix(prefix: string): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(this.data)) {
            if (k.startsWith(prefix)) {
                result[k] = v;
            }
        }
        return result;
    }
}

function createMockLogger(): Logger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

describe("T-33: getTransferSettings (계좌이체 전용)", () => {
    it("은행 송금 정보 3종(은행명, 계좌번호, 예금주)이 모두 채워져 있으면 configured가 true이고 warn이 발생하지 않는다", async () => {
        const fakeRepo = new FakeSettingsRepository({
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "국민은행",
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "123-456-789012",
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "홍길동",
        });
        const mockLogger = createMockLogger();

        const result = await getTransferSettings(fakeRepo, mockLogger);

        expect(result.configured).toBe(true);
        expect(result.bankName).toBe("국민은행");
        expect(result.accountNumber).toBe("123-456-789012");
        expect(result.accountHolder).toBe("홍길동");
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it("은행 송금 정보 3종이 모두 비어있으면 configured가 false이고 settings.transfer.missing warn 로그가 남는다 (F-44)", async () => {
        const fakeRepo = new FakeSettingsRepository({
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "",
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "",
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "",
        });
        const mockLogger = createMockLogger();

        const result = await getTransferSettings(fakeRepo, mockLogger);

        expect(result.configured).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith("settings.transfer.missing");
    });

    it("은행명만 누락된 경우 configured가 false이고 settings.transfer.missing warn 로그가 남는다", async () => {
        const fakeRepo = new FakeSettingsRepository({
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "", // 누락
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "123-456-789012",
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "홍길동",
        });
        const mockLogger = createMockLogger();

        const result = await getTransferSettings(fakeRepo, mockLogger);

        expect(result.configured).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith("settings.transfer.missing");
    });

    it("계좌번호만 누락된 경우 configured가 false이고 settings.transfer.missing warn 로그가 남는다", async () => {
        const fakeRepo = new FakeSettingsRepository({
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "국민은행",
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "", // 누락
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "홍길동",
        });
        const mockLogger = createMockLogger();

        const result = await getTransferSettings(fakeRepo, mockLogger);

        expect(result.configured).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith("settings.transfer.missing");
    });

    it("예금주만 누락된 경우 configured가 false이고 settings.transfer.missing warn 로그가 남는다", async () => {
        const fakeRepo = new FakeSettingsRepository({
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "국민은행",
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "123-456-789012",
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "", // 누락
        });
        const mockLogger = createMockLogger();

        const result = await getTransferSettings(fakeRepo, mockLogger);

        expect(result.configured).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith("settings.transfer.missing");
    });

    it("공백 문자열('   ')만 입력된 값은 trim 처리되어 빈 값으로 간주된다", async () => {
        const fakeRepo = new FakeSettingsRepository({
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "   ",
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "   ",
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "   ",
        });
        const mockLogger = createMockLogger();

        const result = await getTransferSettings(fakeRepo, mockLogger);

        expect(result.configured).toBe(false);
        expect(result.bankName).toBe("");
        expect(result.accountNumber).toBe("");
        expect(result.accountHolder).toBe("");
        expect(mockLogger.warn).toHaveBeenCalledWith("settings.transfer.missing");
    });

    it("app_settings에 다른 관리자 키(payment.*, auto_complete.*)가 존재해도 고객 응답에는 오직 화이트리스트 필드만 노출된다", async () => {
        const fakeRepo = new FakeSettingsRepository({
            "payment.expire_minutes": "10",
            "auto_complete.enabled": "true",
            "auto_complete.minutes": "15",
            [TRANSFER_SETTING_KEYS.BANK_NAME]: "신한은행",
            [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: "110-123-456789",
            [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: "평택대 축제단",
            "admin.secret_key": "do_not_expose",
        });

        const result = await getTransferSettings(fakeRepo);

        // 결과 객체의 키 목록이 정확히 계좌 정보 DTO 키만 포함하는지 검증
        const returnedKeys = Object.keys(result).sort();
        const expectedKeys = [
            "accountHolder",
            "accountNumber",
            "bankName",
            "configured",
        ].sort();

        expect(returnedKeys).toEqual(expectedKeys);
        expect((result as Record<string, unknown>)["payment.expire_minutes"]).toBeUndefined();
        expect((result as Record<string, unknown>)["admin.secret_key"]).toBeUndefined();
    });

    it("N-05: 소스 코드 및 시드 파일에 실제 계좌번호나 실서비스 송금 URL이 하드코딩되어 있지 않다", () => {
        const srcDir = path.resolve(__dirname, "../../../src");
        const checkDir = (dir: string) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    checkDir(fullPath);
                } else if (/\.(ts|tsx|js|mjs|json|sql)$/.test(file)) {
                    const content = fs.readFileSync(fullPath, "utf-8");
                    expect(content).not.toMatch(/qr\.kakaopay\.com\/[a-zA-Z0-9_-]{8,}/);
                    expect(content).not.toMatch(/toss\.me\/[a-zA-Z0-9_-]+/);
                }
            }
        };

        checkDir(srcDir);
    });
});
