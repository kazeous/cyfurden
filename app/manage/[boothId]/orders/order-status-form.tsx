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
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import styles from "./orders.module.css";

const initialState: OrderStatusActionState = {
  status: "idle",
  message: "",
};

export function OrderStatusForm({
  boothId,
  orderId,
  orderCode,
  currentStatus,
  locale,
}: {
  boothId: string;
  orderId: string;
  orderCode: string;
  currentStatus: OrderStatusName;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).orders;
  const actionLabels: Record<OrderStatusName, string> = {
    PENDING: strings.actionReturnReview,
    CONFIRMED: strings.actionConfirm,
    FULFILLED: strings.actionFulfil,
    CANCELLED: strings.actionCancel,
    EXPIRED: strings.actionExpire,
  };
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
      aria-label={strings.actionsAria(orderCode)}
    >
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="orderId" value={orderId} />
      {terminal ? (
        <p className={styles.terminalStatus}>{strings.noFurtherActions}</p>
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
              {pending ? strings.savingStatus : actionLabels[nextStatus]}
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
