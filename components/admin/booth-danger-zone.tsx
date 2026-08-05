"use client";

import { useActionState } from "react";
import {
  deleteBoothAction,
  type DeleteBoothState,
} from "@/app/manage/[boothId]/actions";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import styles from "./admin.module.css";

const initialState: DeleteBoothState = { error: null };

export function BoothDangerZone({
  boothId,
  boothName,
  boothSlug,
  locale,
}: {
  boothId: string;
  boothName: string;
  boothSlug: string;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).danger;
  const [state, action, pending] = useActionState(
    deleteBoothAction,
    initialState,
  );

  return (
    <section className={styles.dangerZone} aria-labelledby="delete-booth-title">
      <div>
        <p className={styles.dangerEyebrow}>{strings.eyebrow}</p>
        <h2 id="delete-booth-title">{strings.title(boothName)}</h2>
        <p>{strings.description}</p>
      </div>
      <form action={action} className={styles.dangerForm}>
        <input type="hidden" name="boothId" value={boothId} />
        <label>
          {strings.confirmation(boothSlug)}
          <input
            name="confirmation"
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {state.error ? (
          <p className={styles.dangerError} role="alert">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={pending}>
          {pending ? strings.deleting : strings.delete}
        </button>
      </form>
    </section>
  );
}
