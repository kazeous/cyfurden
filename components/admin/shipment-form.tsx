"use client";

import { useActionState, useId } from "react";
import {
  saveOrderShipmentAction,
  type OrderShipmentActionState,
} from "@/app/manage/[boothId]/actions";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import styles from "./order-operations.module.css";

const initialState: OrderShipmentActionState = { status: "idle", message: "" };

export function ShipmentForm({
  boothId,
  orderId,
  shipment,
  locale,
}: {
  boothId: string;
  orderId: string;
  shipment: {
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  };
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).orderOperations;
  const [state, action, pending] = useActionState(
    saveOrderShipmentAction,
    initialState,
  );
  const messageId = useId();
  return (
    <form
      action={action}
      className={styles.shipmentForm}
      aria-busy={pending}
      aria-describedby={state.message ? messageId : undefined}
    >
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="orderId" value={orderId} />
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>{strings.carrier}</span>
          <input
            name="carrier"
            maxLength={100}
            defaultValue={shipment.carrier ?? ""}
            placeholder={strings.carrierPlaceholder}
          />
        </label>
        <label className={styles.field}>
          <span>{strings.trackingNumber}</span>
          <input
            name="trackingNumber"
            maxLength={120}
            defaultValue={shipment.trackingNumber ?? ""}
            placeholder={strings.trackingNumberPlaceholder}
          />
        </label>
        <label className={styles.field}>
          <span>{strings.trackingUrl}</span>
          <input
            name="trackingUrl"
            type="url"
            maxLength={500}
            defaultValue={shipment.trackingUrl ?? ""}
            placeholder={strings.trackingUrlPlaceholder}
          />
        </label>
      </div>
      <div className={styles.statusAction}>
        <button
          className={styles.buttonPrimary}
          type="submit"
          disabled={pending}
        >
          {pending ? strings.savingShipment : strings.saveShipment}
        </button>
      </div>
      <p
        id={messageId}
        className={styles.formMessage}
        data-state={state.status}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
    </form>
  );
}
