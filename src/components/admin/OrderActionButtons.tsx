import type { TransitionAction } from "@/lib/dto/adminOrder";
import styles from "./OrderDashboard.module.css";

const ACTIONS = [
    { action: "confirm_payment", label: "입금 확인" },
    { action: "confirm_cash", label: "현금 수령 확인" },
    { action: "start_cooking", label: "조리 시작" },
    { action: "complete", label: "조리 완료" },
] as const;

export function OrderActionButtons({ availableActions, pendingAction, disabled, onAction }: {
    availableActions: TransitionAction[];
    pendingAction: TransitionAction | null;
    disabled: boolean;
    onAction: (action: TransitionAction) => void;
}) {
    return <div className={styles.actions} aria-label="주문 상태 변경">
        <h2>상태 변경</h2>
        <div>{ACTIONS.map(({ action, label }) => <button key={action} type="button"
            disabled={disabled || !availableActions.includes(action)}
            onClick={() => onAction(action)}>{pendingAction === action ? "처리 중…" : label}</button>)}</div>
    </div>;
}
