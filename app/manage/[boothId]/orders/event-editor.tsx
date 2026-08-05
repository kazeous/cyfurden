"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveOrderEventAction, type OrderEventActionState } from "../actions";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
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
  locale,
}: {
  boothId: string;
  event?: EditableOrderEvent;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).orders;
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
        {strings.eventName}
        <input
          id={`event-name-${fieldSuffix}`}
          name="name"
          type="text"
          minLength={2}
          maxLength={100}
          defaultValue={event?.name}
          placeholder={strings.eventPlaceholder}
          required
        />
      </label>
      <div className={styles.eventDateFields}>
        <label htmlFor={`event-start-${fieldSuffix}`}>
          {strings.eventStarts}
          <input
            id={`event-start-${fieldSuffix}`}
            name="startDate"
            type="date"
            defaultValue={event?.startDate}
            required
          />
        </label>
        <label htmlFor={`event-end-${fieldSuffix}`}>
          {strings.eventEnds}
          <input
            id={`event-end-${fieldSuffix}`}
            name="endDate"
            type="date"
            defaultValue={event?.endDate}
            required
          />
        </label>
      </div>
      <p className={styles.eventTimezone}>{strings.eventTimezone}</p>
      <div className={styles.eventFormFooter}>
        <button type="submit" disabled={pending}>
          {pending
            ? strings.savingEvent
            : event
              ? strings.saveEvent
              : strings.createEventButton}
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
