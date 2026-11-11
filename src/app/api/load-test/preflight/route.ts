import { createServiceClient } from "@/infra/supabase/server";

export const dynamic = "force-dynamic";

// Fail closed even when a localhost app accidentally uses a production .env.local.
// The RPC is installed separately ONLY in a disposable local database.
export async function GET(request: Request) {
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const run = process.env.LOAD_TEST_RUN_ID;
    if (process.env.LOAD_TEST_ISOLATED !== "YES" ||
        !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}$/.test(dbUrl ?? "") ||
        !/^[0-9a-f]{8}$/.test(run ?? "") ||
        request.headers.has("cf-connecting-ip") || request.headers.has("cf-ray")) {
        return new Response(null, { status: 404 });
    }
    const { data, error } = await createServiceClient().rpc("load_test_inspect", { p_run: run });
    if (error || !data?.prepared || data.run !== run) return new Response(null, { status: 409 });
    return Response.json({ run, dbUrl, prepared: true }, { headers: { "Cache-Control": "no-store" } });
}
