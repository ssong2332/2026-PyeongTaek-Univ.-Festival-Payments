import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ShiftPreview } from "@/features/admin/ShiftPreview";
import { readEmergencyContact } from "@/lib/emergencyContact";

// 개발 전용 교대 스케줄 미리보기 — DB 없이 메모리에서 등록·수정·삭제·붙여넣기를 해 본다.
export default function ShiftPreviewPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return (
        <AdminShell email="preview@example.test" emergency={readEmergencyContact()}>
            <ShiftPreview />
        </AdminShell>
    );
}
