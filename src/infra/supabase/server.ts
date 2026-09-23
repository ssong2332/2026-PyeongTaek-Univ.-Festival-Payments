import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseUrl, requireServerKey } from "./config";

export function createServiceClient() {
    return createClient(
        readSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
        requireServerKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        },
    );
}
