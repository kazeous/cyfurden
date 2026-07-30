"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveOrderEventAction, type OrderEventActionState } from "../actions";
import styles from "./orders.module.css";

const initialState: OrderEventActionState = {
  status: "idle",
  message: "",
};

export type EditableOrderEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export function EventEditor({
  boothId,
  event,
}: {
  boothId: string;
  event?: EditableOrderEvent;
}) {
  const [state, formAction, pending] = useActionState(
    saveOrderEventAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!event && state.status === "success") formRef.current?.reset();
  }, [event, state]);

  const fieldSuffix = event?.id ?? "new";

  return (
    <form ref={formRef} action={formAction} className={styles.eventForm}>
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="eventId" value={event?.id ?? ""} />
      <label htmlFor={`event-name-${fieldSuffix}`}>
        Event name
        <input
          id={`event-name-${fieldSuffix}`}
          name="name"
          type="text"
          minLength={2}
          maxLength={100}
          defaultValue={event?.name}
          placeholder="Summer Artist Alley"
          required
        />
      </label>
      <div className={styles.eventDateFields}>
        <label htmlFor={`event-start-${fieldSuffix}`}>
          Starts
          <input
            id={`event-start-${fieldSuffix}`}
            name="startDate"
            type="date"
            defaultValue={event?.startDate}
            required
          />
        </label>
        <label htmlFor={`event-end-${fieldSuffix}`}>
          Ends
          <input
            id={`event-end-${fieldSuffix}`}
            name="endDate"
            type="date"
            defaultValue={event?.endDate}
            required
          />
        </label>
      </div>
      <p className={styles.eventTimezone}>
        Dates include the full day in Asia/Ho_Chi_Minh. Booth events cannot
        overlap.
      </p>
      <div className={styles.eventFormFooter}>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : event ? "Save event" : "Create event"}
        </button>
        <p
          className={styles.eventFormMessage}
          data-state={state.status}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      </div>
    </form>
  );
}
