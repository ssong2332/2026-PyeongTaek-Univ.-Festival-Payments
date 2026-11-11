import { LiveKitchenBoard } from "@/features/admin/LiveKitchenBoard";

export default function KitchenPage() {
    return <LiveKitchenBoard initialNow={new Date().toISOString()} />;
}
