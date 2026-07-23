"use client";

import { useActionState } from "react";
import {
  deleteBoothAction,
  type DeleteBoothState,
} from "@/app/manage/[boothId]/actions";
import styles from "./admin.module.css";

const initialState: DeleteBoothState = { error: null };

export function BoothDangerZone({
  boothId,
  boothName,
  boothSlug,
}: {
  boothId: string;
  boothName: string;
  boothSlug: string;
}) {
  const [state, action, pending] = useActionState(
    deleteBoothAction,
    initialState,
  );

  return (
    <section className={styles.dangerZone} aria-labelledby="delete-booth-title">
      <div>
        <p className={styles.dangerEyebrow}>Booth lifecycle</p>
        <h2 id="delete-booth-title">Delete {boothName}</h2>
        <p>
          This permanently removes a booth that has no order history. Product,
          storefront, team, and configuration records are removed with it.
          Oracle bucket lifecycle rules should clean up unreferenced images.
        </p>
      </div>
      <form action={action} className={styles.dangerForm}>
        <input type="hidden" name="boothId" value={boothId} />
        <label>
          Type <strong>{boothSlug}</strong> to confirm
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
          {pending ? "Deleting booth…" : "Delete booth"}
        </button>
      </form>
    </section>
  );
}
