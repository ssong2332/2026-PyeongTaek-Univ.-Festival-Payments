import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardPreview } from "@/features/admin/DashboardPreview";

export default function AdminPreviewPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <AdminShell email="preview@example.test"><DashboardPreview /></AdminShell>;
}
