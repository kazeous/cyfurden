"use client";

import { useActionState, useState } from "react";
import { createBooth, type CreateBoothState } from "../actions";
import styles from "../dashboard.module.css";

const initialState: CreateBoothState = {};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateBoothForm() {
  const [state, formAction, pending] = useActionState(
    createBooth,
    initialState,
  );
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form className={styles.createForm} action={formAction}>
      <div className={styles.field}>
        <label htmlFor="name">Booth name</label>
        <input
          id="name"
          name="name"
          type="text"
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          aria-describedby={
            state.fieldErrors?.name ? "name-error" : "name-help"
          }
          aria-invalid={Boolean(state.fieldErrors?.name)}
          onChange={(event) => {
            if (!slugTouched) setSlug(toSlug(event.target.value));
          }}
          required
        />
        {state.fieldErrors?.name ? (
          <p className={styles.fieldError} id="name-error">
            {state.fieldErrors.name[0]}
          </p>
        ) : (
          <p className={styles.fieldHelp} id="name-help">
            This is the name visitors and teammates will see.
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="slug">Booth address</label>
        <div className={styles.slugField}>
          <span>/s/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            minLength={3}
            maxLength={48}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(toSlug(event.target.value));
            }}
            aria-describedby={
              state.fieldErrors?.slug ? "slug-error" : "slug-help"
            }
            aria-invalid={Boolean(state.fieldErrors?.slug)}
            required
          />
        </div>
        {state.fieldErrors?.slug ? (
          <p className={styles.fieldError} id="slug-error">
            {state.fieldErrors.slug[0]}
          </p>
        ) : (
          <p className={styles.fieldHelp} id="slug-help">
            Lowercase letters, numbers, and hyphens only. You can change it
            before launch.
          </p>
        )}
      </div>

      {state.message ? (
        <p className={styles.formMessage} role="alert">
          {state.message}
        </p>
      ) : null}

      <button className={styles.createButton} type="submit" disabled={pending}>
        {pending ? "Creating booth…" : "Create booth"}
      </button>
    </form>
  );
}
