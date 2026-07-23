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

const orderStatuses = [
  { value: "PENDING", label: "Needs review" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
] as const;

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
  currentStatus: (typeof orderStatuses)[number]["value"];
}) {
  const [state, formAction, pending] = useActionState(
    updateOrderStatusAction,
    initialState,
  );
  const statusId = useId();
  const messageId = useId();
  const allowedStatuses = orderStatuses.filter(
    (status) =>
      status.value === currentStatus ||
      orderStatusTransitions[currentStatus as OrderStatusName].includes(
        status.value,
      ),
  );
  const terminal = allowedStatuses.length === 1;

  return (
    <form
      action={formAction}
      className={styles.statusForm}
      aria-busy={pending}
      aria-describedby={state.message ? messageId : undefined}
    >
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="orderId" value={orderId} />
      <label className={styles.srOnly} htmlFor={statusId}>
        Status for order {orderCode}
      </label>
      <div className={styles.statusControls}>
        <select
          id={statusId}
          name="status"
          defaultValue={currentStatus}
          disabled={pending || terminal}
        >
          {allowedStatuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending || terminal}>
          {pending ? "Saving…" : terminal ? "Final" : "Save"}
        </button>
      </div>
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
