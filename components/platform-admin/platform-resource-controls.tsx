"use client";

import { useActionState } from "react";
import {
  platformBoothQuotaAction,
  platformDefaultQuotaAction,
  platformStorageReconciliationAction,
  platformUserQuotaAction,
  type PlatformResourceActionState,
} from "@/app/admin/actions";
import type { Locale } from "@/lib/i18n";
import {
  getPlatformAdminStrings,
  type PlatformAdminCatalogue,
} from "@/lib/i18n/platform-admin";
import styles from "./platform-admin.module.css";

const initialState = {
  status: "idle",
  message: "",
} satisfies PlatformResourceActionState;

function ResourceFeedback({ state }: { state: PlatformResourceActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={styles.actionFeedback}
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      <strong>{state.message}</strong>
    </div>
  );
}

function ReasonField({ strings }: { strings: PlatformAdminCatalogue }) {
  return (
    <label className={styles.actionField}>
      <span>{strings.lifecycle.reason}</span>
      <textarea
        maxLength={500}
        minLength={1}
        name="reason"
        placeholder={strings.lifecycle.reasonPlaceholder}
        required
        rows={3}
      />
    </label>
  );
}

function OptionalNumberField({
  defaultValue,
  label,
  max,
  name,
  required = false,
  strings,
}: {
  defaultValue: number | string | null;
  label: string;
  max: number;
  name: string;
  required?: boolean;
  strings: PlatformAdminCatalogue;
}) {
  return (
    <label className={styles.actionField}>
      <span>{label}</span>
      <input
        defaultValue={defaultValue ?? ""}
        inputMode="numeric"
        max={max}
        min={1}
        name={name}
        placeholder={strings.resourceControls.blankInherits}
        required={required}
        step={1}
        type="number"
      />
    </label>
  );
}

export function PlatformDefaultQuotaControls({
  defaults,
  locale,
}: {
  defaults: {
    maxFaceboothProjects: number;
    maxOwnedBooths: number;
    maxProducts: number;
    maxStorageMiB: string;
    maxTeamSeats: number;
  };
  locale: Locale;
}) {
  const strings = getPlatformAdminStrings(locale);
  const [state, action, pending] = useActionState(
    platformDefaultQuotaAction,
    initialState,
  );
  return (
    <section className={styles.actionSection}>
      <header>
        <h2>{strings.resourceControls.defaultsTitle}</h2>
        <p>{strings.resourceControls.defaultsDescription}</p>
      </header>
      <form action={action} className={styles.actionForm}>
        <div className={styles.actionFieldsInline}>
          <OptionalNumberField
            defaultValue={defaults.maxOwnedBooths}
            label={strings.resourceControls.maxOwnedBooths}
            max={1_000}
            name="maxOwnedBooths"
            required
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={defaults.maxTeamSeats}
            label={strings.resourceControls.maxTeamSeats}
            max={10_000}
            name="maxTeamSeats"
            required
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={defaults.maxProducts}
            label={strings.resourceControls.maxProducts}
            max={1_000_000}
            name="maxProducts"
            required
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={defaults.maxFaceboothProjects}
            label={strings.resourceControls.maxFaceboothProjects}
            max={100_000}
            name="maxFaceboothProjects"
            required
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={defaults.maxStorageMiB}
            label={strings.resourceControls.maxStorageMiB}
            max={1_073_741_824}
            name="maxStorageMiB"
            required
            strings={strings}
          />
        </div>
        <ReasonField strings={strings} />
        <button className={styles.button} disabled={pending} type="submit">
          {pending
            ? strings.resourceControls.pending
            : strings.resourceControls.saveDefaults}
        </button>
      </form>
      <ResourceFeedback state={state} />
    </section>
  );
}

export function PlatformUserQuotaControls({
  configured,
  locale,
  targetUserId,
}: {
  configured: number | null;
  locale: Locale;
  targetUserId: string;
}) {
  const strings = getPlatformAdminStrings(locale);
  const [state, action, pending] = useActionState(
    platformUserQuotaAction,
    initialState,
  );
  return (
    <section className={styles.actionSection}>
      <header>
        <h2>{strings.resourceControls.userTitle}</h2>
        <p>{strings.resourceControls.userDescription}</p>
      </header>
      <form action={action} className={styles.actionForm}>
        <input name="targetUserId" type="hidden" value={targetUserId} />
        <OptionalNumberField
          defaultValue={configured}
          label={strings.resourceControls.maxOwnedBooths}
          max={1_000}
          name="maxOwnedBooths"
          strings={strings}
        />
        <ReasonField strings={strings} />
        <button className={styles.button} disabled={pending} type="submit">
          {pending
            ? strings.resourceControls.pending
            : strings.resourceControls.saveQuota}
        </button>
      </form>
      <ResourceFeedback state={state} />
    </section>
  );
}

export function PlatformBoothResourceControls({
  boothId,
  configured,
  locale,
}: {
  boothId: string;
  configured: {
    maxFaceboothProjects: number | null;
    maxProducts: number | null;
    maxStorageMiB: string | null;
    maxTeamSeats: number | null;
  };
  locale: Locale;
}) {
  const strings = getPlatformAdminStrings(locale);
  const [quotaState, quotaAction, quotaPending] = useActionState(
    platformBoothQuotaAction,
    initialState,
  );
  const [reconciliationState, reconciliationAction, reconciliationPending] =
    useActionState(platformStorageReconciliationAction, initialState);
  return (
    <section className={styles.actionSection}>
      <header>
        <h2>{strings.resourceControls.boothTitle}</h2>
        <p>{strings.resourceControls.boothDescription}</p>
      </header>
      <form action={quotaAction} className={styles.actionForm}>
        <input name="boothId" type="hidden" value={boothId} />
        <div className={styles.actionFieldsInline}>
          <OptionalNumberField
            defaultValue={configured.maxTeamSeats}
            label={strings.resourceControls.maxTeamSeats}
            max={10_000}
            name="maxTeamSeats"
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={configured.maxProducts}
            label={strings.resourceControls.maxProducts}
            max={1_000_000}
            name="maxProducts"
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={configured.maxFaceboothProjects}
            label={strings.resourceControls.maxFaceboothProjects}
            max={100_000}
            name="maxFaceboothProjects"
            strings={strings}
          />
          <OptionalNumberField
            defaultValue={configured.maxStorageMiB}
            label={strings.resourceControls.maxStorageMiB}
            max={1_073_741_824}
            name="maxStorageMiB"
            strings={strings}
          />
        </div>
        <ReasonField strings={strings} />
        <button className={styles.button} disabled={quotaPending} type="submit">
          {quotaPending
            ? strings.resourceControls.pending
            : strings.resourceControls.saveQuota}
        </button>
      </form>
      <ResourceFeedback state={quotaState} />

      <form action={reconciliationAction} className={styles.actionForm}>
        <input name="boothId" type="hidden" value={boothId} />
        <h3>{strings.resourceControls.reconciliationTitle}</h3>
        <p>{strings.resourceControls.reconciliationDescription}</p>
        <ReasonField strings={strings} />
        <button
          className={styles.button}
          disabled={reconciliationPending}
          type="submit"
        >
          {reconciliationPending
            ? strings.resourceControls.pending
            : strings.resourceControls.reconcile}
        </button>
      </form>
      <ResourceFeedback state={reconciliationState} />
    </section>
  );
}
