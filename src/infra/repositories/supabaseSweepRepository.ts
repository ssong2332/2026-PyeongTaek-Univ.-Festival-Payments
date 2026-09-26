import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { createServiceClient } from "@/infra/supabase/server";
import type { SweepRepository, SweepResult } from "@/services/ports";

const sweepResultSchema = z.object({
    expired: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
});

export class SupabaseSweepRepository implements SweepRepository {
    private readonly client: SupabaseClient;

    constructor(client?: SupabaseClient) {
        this.client = client ?? createServiceClient();
    }

    async sweep(): Promise<SweepResult> {
        // DB 기본값 now()를 사용한다. 요청자가 테스트용 p_now를 지정할 수 없다.
        const { data, error } = await this.client.rpc("sweep_order_timeouts");
        if (error) throw new AppError("INTERNAL_ERROR", 500);

        const result = sweepResultSchema.safeParse(data);
        if (!result.success) throw new AppError("INTERNAL_ERROR", 500);
        return result.data;
    }
}
