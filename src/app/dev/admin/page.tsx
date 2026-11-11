import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardPreview } from "@/features/admin/DashboardPreview";
import { readEmergencyContact } from "@/lib/emergencyContact";

export default function AdminPreviewPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <AdminShell email="preview@example.test" emergency={readEmergencyContact()}><DashboardPreview /></AdminShell>;
}
