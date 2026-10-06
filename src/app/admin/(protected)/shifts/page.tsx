import { ShiftManagement } from "@/features/admin/ShiftManagement";

export default function ShiftsPage() {
  return <ShiftManagement initialNow={new Date().toISOString()} />;
}
