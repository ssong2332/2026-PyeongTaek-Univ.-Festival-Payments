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
            throw new AppError("INTERNAL_ERROR", "Failed to fetch setting", 500, error.message);
        }

        return data?.value ?? null;
    }

    async getAll(): Promise<Record<string, string>> {
        const { data, error } = await this.client
            .from("app_settings")
            .select("key, value");

        if (error) {
            throw new AppError("INTERNAL_ERROR", "Failed to fetch settings", 500, error.message);
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
            throw new AppError("INTERNAL_ERROR", "Failed to fetch settings by prefix", 500, error.message);
        }

        const result: Record<string, string> = {};
        for (const row of (data as AppSettingRow[]) ?? []) {
            result[row.key] = row.value;
        }
        return result;
    }
}
