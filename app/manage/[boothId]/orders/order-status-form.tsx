"use client";

import { useActionState, useId } from "react";
import {
  type OrderStatusActionState,
  updateOrderStatusAction,
} from "../actions";
import {
  type OrderStatusName,
  orderStatusTransitions,
} from "@/lib/order-rules";
import styles from "./orders.module.css";

const actionLabels: Record<OrderStatusName, string> = {
  PENDING: "Return to review",
  CONFIRMED: "Confirm transfer",
  FULFILLED: "Mark fulfilled",
  CANCELLED: "Cancel reservation",
  EXPIRED: "Expire now",
};

const initialState: OrderStatusActionState = {
  status: "idle",
  message: "",
};

export function OrderStatusForm({
  boothId,
  orderId,
  orderCode,
  currentStatus,
}: {
  boothId: string;
  orderId: string;
  orderCode: string;
  currentStatus: OrderStatusName;
}) {
  const [state, formAction, pending] = useActionState(
    updateOrderStatusAction,
    initialState,
  );
  const messageId = useId();
  const availableTransitions = orderStatusTransitions[currentStatus];
  const terminal = availableTransitions.length === 0;

  return (
    <form
      action={formAction}
      className={styles.statusForm}
      aria-busy={pending}
      aria-describedby={state.message ? messageId : undefined}
      aria-label={`Actions for order ${orderCode}`}
    >
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="orderId" value={orderId} />
      {terminal ? (
        <p className={styles.terminalStatus}>No further actions</p>
      ) : (
        <div className={styles.statusControls}>
          {availableTransitions.map((nextStatus) => (
            <button
              key={nextStatus}
              type="submit"
              name="status"
              value={nextStatus}
              data-transition={nextStatus}
              disabled={pending}
            >
              {pending ? "Saving…" : actionLabels[nextStatus]}
            </button>
          ))}
        </div>
      )}
      <p
        id={messageId}
        className={styles.actionMessage}
        data-state={state.status}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
    </form>
  );
}
