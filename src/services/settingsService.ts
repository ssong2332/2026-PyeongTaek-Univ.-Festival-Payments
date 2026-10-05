import {
    TransferSettingsDto,
    TRANSFER_SETTING_KEYS,
    ADMIN_SETTING_KEYS,
    SETTING_SCHEMAS,
    AdminSettingKey,
} from "@/lib/dto/settings";
import { SettingsRepository } from "./ports";
import type { Logger } from "@/lib/logger";
import { AppError } from "@/lib/api/errors";

export async function getTransferSettings(
    repository: SettingsRepository,
    loggerInstance?: Logger,
): Promise<TransferSettingsDto> {
    const records = await repository.getByPrefix("transfer.");

    const bankName = records[TRANSFER_SETTING_KEYS.BANK_NAME]?.trim() ?? "";
    const accountNumber = records[TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]?.trim() ?? "";
    const accountHolder = records[TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]?.trim() ?? "";

    const configured = bankName.length > 0 && accountNumber.length > 0 && accountHolder.length > 0;

    if (!configured && loggerInstance) {
        loggerInstance.warn("settings.transfer.missing");
    }

    return {
        configured,
        bankName,
        accountNumber,
        accountHolder,
    };
}

/**
 * 전체 관리자 설정 조회
 * Architecture 7절: GET /api/admin/settings -> { settings: { [key]: string } }
 */
export async function getAllAdminSettings(
    repository: SettingsRepository,
): Promise<Record<string, string>> {
    return await repository.getAll();
}

/**
 * 관리자 설정 부분 갱신 (PUT /api/admin/settings)
 * - ADR-0004 키만 허용 (알 수 없는 키 400 VALIDATION_ERROR)
 * - 키별 zod 검증 (범위 밖 400 VALIDATION_ERROR)
 * - 부분 갱신 — 전달된 키만 upsert하고 나머지 유지
 * - 갱신 후 전체 설정 반환
 */
export async function updateAdminSettings(
    repository: SettingsRepository,
    newSettings: Record<string, string>,
    userId?: string,
): Promise<Record<string, string>> {
    const allowedKeysSet = new Set<string>(ADMIN_SETTING_KEYS);
    const unknownKeys: string[] = [];

    for (const key of Object.keys(newSettings)) {
        if (!allowedKeysSet.has(key)) {
            unknownKeys.push(key);
        }
    }

    if (unknownKeys.length > 0) {
        throw new AppError(
            "VALIDATION_ERROR",
            400,
            unknownKeys.map((k) => ({ path: [k], message: `Unknown setting key: ${k}` })),
        );
    }

    // 키별 zod 검증
    for (const [key, value] of Object.entries(newSettings)) {
        const schema = SETTING_SCHEMAS[key as AdminSettingKey];
        if (schema) {
            const parsed = schema.safeParse(value);
            if (!parsed.success) {
                throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
            }
        }
    }

    if (repository.setMany) {
        await repository.setMany(newSettings, userId);
    } else if (repository.set) {
        for (const [key, value] of Object.entries(newSettings)) {
            await repository.set(key, value, userId);
        }
    }

    return await repository.getAll();
}
