import { TransferSettingsDto, TRANSFER_SETTING_KEYS } from "@/lib/dto/settings";
import { SettingsRepository } from "./ports";
import type { Logger } from "@/lib/logger";

export async function getTransferSettings(
    repository: SettingsRepository,
    loggerInstance?: Logger,
): Promise<TransferSettingsDto> {
    const records = await repository.getByPrefix("transfer.");

    const bankName = records[TRANSFER_SETTING_KEYS.BANK_NAME]?.trim() ?? "";
    const accountNumber = records[TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]?.trim() ?? "";
    const accountHolder = records[TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]?.trim() ?? "";
    const kakaopayUrlTemplate = records[TRANSFER_SETTING_KEYS.KAKAO_PAY_URL_TEMPLATE]?.trim() ?? "";
    // Per ADR-0004 (T-34 result), toss 개인 송금 링크는 서비스 종료되어 대체 방식 확정 전까지 빈 문자열 유지
    const tossUrlTemplate = records[TRANSFER_SETTING_KEYS.TOSS_URL_TEMPLATE]?.trim() ?? "";

    const hasCompleteBankInfo = bankName.length > 0 && accountNumber.length > 0 && accountHolder.length > 0;
    const hasAnyUrlTemplate = kakaopayUrlTemplate.length > 0 || tossUrlTemplate.length > 0;

    const configured = hasCompleteBankInfo || hasAnyUrlTemplate;

    if (!configured && loggerInstance) {
        loggerInstance.warn("settings.transfer.missing");
    }

    return {
        configured,
        bankName,
        accountNumber,
        accountHolder,
        kakaopayUrlTemplate,
        tossUrlTemplate,
    };
}
