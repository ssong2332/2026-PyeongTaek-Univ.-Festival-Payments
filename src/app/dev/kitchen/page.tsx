import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { KitchenPreview } from "@/features/admin/KitchenPreview";
import { readEmergencyContact } from "@/lib/emergencyContact";

// 개발 전용 조리 화면 미리보기 — DB 없이 메모리의 조리중 주문으로 완료 버튼까지 눌러 본다.
export default function KitchenPreviewPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return (
        <AdminShell email="preview@example.test" emergency={readEmergencyContact()}>
            <KitchenPreview initialNow={new Date().toISOString()} />
        </AdminShell>
    );
}
