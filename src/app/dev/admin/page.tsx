import { notFound } from "next/navigation";
import { DashboardPreview } from "@/features/admin/DashboardPreview";

export default function AdminPreviewPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <DashboardPreview />;
}
