"use client";

import type { FaceboothRecoveryDraft } from "@/lib/facebooth-drafts";
import type { FaceboothStrings } from "@/lib/i18n/facebooth";
import type { FaceboothSaveState } from "./use-facebooth-autosave";
import styles from "./facebooth-autosave-controls.module.css";

export function FaceboothAutosaveControls({
  saveState,
  recoveryDraft,
  strings,
  disabled,
  onSaveNow,
  onRestoreDraft,
  onDiscardDraft,
  onReloadRemote,
  onDuplicateVersion,
}: {
  saveState: FaceboothSaveState;
  recoveryDraft: FaceboothRecoveryDraft | null;
  strings: FaceboothStrings;
  disabled?: boolean;
  onSaveNow: () => void;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  onReloadRemote: () => void;
  onDuplicateVersion: () => void;
}) {
  const label =
    saveState === "SAVING"
      ? strings.saving
      : saveState === "SAVED"
        ? strings.saved
        : saveState === "OFFLINE"
          ? strings.offline
          : saveState === "CONFLICT"
            ? strings.conflict
            : saveState === "ERROR"
              ? strings.uploadError
              : strings.unsaved;
  return (
    <div className={styles.cluster}>
      <div className={styles.primaryRow}>
        <span aria-live="polite" data-state={saveState}>
          {label}
        </span>
        <button
          disabled={
            disabled ||
            saveState === "SAVED" ||
            saveState === "SAVING" ||
            saveState === "CONFLICT"
          }
          onClick={onSaveNow}
          type="button"
        >
          {strings.saveNow}
        </button>
      </div>
      {recoveryDraft ? (
        <div className={styles.notice} role="status">
          <span>{strings.recoveryAvailable}</span>
          <button onClick={onRestoreDraft} type="button">
            {strings.restoreDraft}
          </button>
          <button onClick={onDiscardDraft} type="button">
            {strings.discardDraft}
          </button>
        </div>
      ) : null}
      {saveState === "CONFLICT" ? (
        <div className={styles.notice} data-kind="conflict" role="alert">
          <span>{strings.conflict}</span>
          <button onClick={onReloadRemote} type="button">
            {strings.reloadRemote}
          </button>
          <button onClick={onDuplicateVersion} type="button">
            {strings.duplicateMyVersion}
          </button>
        </div>
      ) : null}
    </div>
  );
}
