import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/infra/supabase/server";
import type { SweepRepository, SweepResult } from "@/services/ports";

const sweepResultSchema = z.object({
    expired: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
});

function safeRpcCode(error: unknown): string {
    const message = error && typeof error === "object" && "message" in error
        ? (error as { message: unknown }).message : undefined;
    if (message === "payment.expire_minutes must be between 1 and 120") return "INVALID_PAYMENT_EXPIRE_MINUTES";
    if (message === "auto_complete.enabled must be true or false") return "INVALID_AUTO_COMPLETE_ENABLED";
    if (message === "auto_complete.minutes must be between 1 and 120") return "INVALID_AUTO_COMPLETE_MINUTES";

    const code = error && typeof error === "object" && "code" in error
        ? (error as { code: unknown }).code : undefined;
    return typeof code === "string" && /^[A-Za-z][A-Za-z0-9_]{1,15}$/.test(code)
        ? code : "RPC_ERROR";
}

export class SupabaseSweepRepository implements SweepRepository {
    private readonly client: SupabaseClient;

    constructor(client?: SupabaseClient) {
        this.client = client ?? createServiceClient();
    }

    async sweep(): Promise<SweepResult> {
        // DB 기본값 now()를 사용한다. 요청자가 테스트용 p_now를 지정할 수 없다.
        let response: Awaited<ReturnType<SupabaseClient["rpc"]>>;
        try {
            response = await this.client.rpc("sweep_order_timeouts");
        } catch (error) {
            logger.error("order.sweep.rpc_threw", undefined, { code: safeRpcCode(error) });
            throw new AppError("INTERNAL_ERROR", 500);
        }
        const { data, error } = response;
        if (error) {
            logger.error("order.sweep.rpc_failed", undefined, { code: safeRpcCode(error) });
            throw new AppError("INTERNAL_ERROR", 500);
        }

        const result = sweepResultSchema.safeParse(data);
        if (!result.success) {
            logger.error("order.sweep.invalid_result", undefined, { code: "INVALID_RPC_RESULT" });
            throw new AppError("INTERNAL_ERROR", 500);
        }
        return result.data;
    }
}
