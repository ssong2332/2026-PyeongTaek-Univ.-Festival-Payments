import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { createSessionClient } from "@/infra/supabase/session";

export const POST = withHandler(
    async () => {
        const supabase = await createSessionClient();
        await supabase.auth.signOut();
        return NextResponse.json({ success: true });
    },
    { route: "/api/admin/logout" },
);
