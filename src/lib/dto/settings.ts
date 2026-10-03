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

export const AUTO_COMPLETE_SETTING_KEYS = {
    ENABLED: "auto_complete.enabled",
    MINUTES: "auto_complete.minutes",
} as const;

export const AutoCompleteEnabledSchema = z.enum(["true", "false"]);
export const AutoCompleteMinutesSchema = z.string().regex(/^\d+$/).refine(
    value => Number(value) >= 1 && Number(value) <= 120,
);

export const AdminSettingsResponseSchema = z.object({
    settings: z.record(z.string(), z.string()),
});
