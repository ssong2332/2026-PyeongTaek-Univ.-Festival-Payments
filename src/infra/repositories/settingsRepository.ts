import { SettingsRepository } from "@/services/ports";
import { AppError } from "@/lib/api/errors";
import { createServiceClient } from "@/infra/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AppSettingRow {
    key: string;
    value: string;
    updated_at: string;
    updated_by: string | null;
}

export class SupabaseSettingsRepository implements SettingsRepository {
    private readonly client: SupabaseClient;

    constructor(client?: SupabaseClient) {
        this.client = client ?? createServiceClient();
    }

    async get(key: string): Promise<string | null> {
        const { data, error } = await this.client
            .from("app_settings")
            .select("value")
            .eq("key", key)
            .maybeSingle();

        if (error) {
            // Architecture 5: 500 INTERNAL_ERROR는 내부 DB 에러 원문을 고객 응답에 노출하지 않음
            throw new AppError("INTERNAL_ERROR", 500);
        }

        return data?.value ?? null;
    }

    async getAll(): Promise<Record<string, string>> {
        const { data, error } = await this.client
            .from("app_settings")
            .select("key, value");

        if (error) {
            throw new AppError("INTERNAL_ERROR", 500);
        }

        const result: Record<string, string> = {};
        for (const row of (data as AppSettingRow[]) ?? []) {
            result[row.key] = row.value;
        }
        return result;
    }

    async getByPrefix(prefix: string): Promise<Record<string, string>> {
        const { data, error } = await this.client
            .from("app_settings")
            .select("key, value")
            .like("key", `${prefix}%`);

        if (error) {
            throw new AppError("INTERNAL_ERROR", 500);
        }

        const result: Record<string, string> = {};
        for (const row of (data as AppSettingRow[]) ?? []) {
            result[row.key] = row.value;
        }
        return result;
    }
}
