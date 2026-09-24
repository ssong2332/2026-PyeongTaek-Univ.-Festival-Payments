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
