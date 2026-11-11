import { redirect } from "next/navigation";
import { createSessionClient } from "@/infra/supabase/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { readEmergencyContact } from "@/lib/emergencyContact";

export default async function AdminProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createSessionClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    // Architecture 8절: 세션 없으면 /admin/login 리다이렉트
    if (error || !user) {
        redirect("/admin/login");
        return null;
    }

    return <AdminShell email={user.email} emergency={readEmergencyContact()}>{children}</AdminShell>;
}
