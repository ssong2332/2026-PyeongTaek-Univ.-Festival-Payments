import { z } from "zod";

export const TRANSFER_SETTING_KEYS = {
    BANK_NAME: "transfer.bank_name",
    ACCOUNT_NUMBER: "transfer.account_number",
    ACCOUNT_HOLDER: "transfer.account_holder",
} as const;

export const TransferSettingsDtoSchema = z.object({
    configured: z.boolean(),
    bankName: z.string(),
    accountNumber: z.string(),
    accountHolder: z.string(),
});

export type TransferSettingsDto = z.infer<typeof TransferSettingsDtoSchema>;
