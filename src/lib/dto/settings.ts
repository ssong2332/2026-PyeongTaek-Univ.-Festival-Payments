import { z } from "zod";

export const TRANSFER_SETTING_KEYS = {
    BANK_NAME: "transfer.bank_name",
    ACCOUNT_NUMBER: "transfer.account_number",
    ACCOUNT_HOLDER: "transfer.account_holder",
} as const;

export const AUTO_COMPLETE_SETTING_KEYS = {
    ENABLED: "auto_complete.enabled",
    MINUTES: "auto_complete.minutes",
} as const;

export const PAYMENT_EXPIRE_SETTING_KEY = "payment.expire_minutes" as const;

export const ADMIN_SETTING_KEYS = [
    TRANSFER_SETTING_KEYS.BANK_NAME,
    TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER,
    TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER,
    AUTO_COMPLETE_SETTING_KEYS.ENABLED,
    AUTO_COMPLETE_SETTING_KEYS.MINUTES,
    PAYMENT_EXPIRE_SETTING_KEY,
] as const;

export type AdminSettingKey = typeof ADMIN_SETTING_KEYS[number];

export const TransferSettingSchema = z.string().max(200);

export const AutoCompleteEnabledSchema = z.enum(["true", "false"]);

export const MinutesSettingSchema = z.string().regex(/^\d+$/, "숫자만 입력할 수 있습니다").refine(
    (val) => {
        const n = Number(val);
        return Number.isInteger(n) && n >= 1 && n <= 120;
    },
    { message: "1부터 120 사이의 정수여야 합니다" },
);

export const PaymentExpireMinutesSchema = MinutesSettingSchema;

/** 키별 zod 유효성 검사 맵 */
export const SETTING_SCHEMAS: Record<AdminSettingKey, z.ZodType<string>> = {
    [TRANSFER_SETTING_KEYS.BANK_NAME]: TransferSettingSchema,
    [TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER]: TransferSettingSchema,
    [TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER]: TransferSettingSchema,
    [AUTO_COMPLETE_SETTING_KEYS.ENABLED]: AutoCompleteEnabledSchema,
    [AUTO_COMPLETE_SETTING_KEYS.MINUTES]: MinutesSettingSchema,
    [PAYMENT_EXPIRE_SETTING_KEY]: PaymentExpireMinutesSchema,
};

export const UpdateAdminSettingsRequestSchema = z.object({
    settings: z.record(z.string(), z.string()),
});
export type UpdateAdminSettingsRequest = z.infer<typeof UpdateAdminSettingsRequestSchema>;

export const AdminSettingsResponseSchema = z.object({
    settings: z.record(z.string(), z.string()),
});
export type AdminSettingsResponse = z.infer<typeof AdminSettingsResponseSchema>;

export const TransferSettingsDtoSchema = z.object({
    configured: z.boolean(),
    bankName: z.string(),
    accountNumber: z.string(),
    accountHolder: z.string(),
});

export type TransferSettingsDto = z.infer<typeof TransferSettingsDtoSchema>;
