"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  validatePasswordReplacement,
  type PasswordReplacementError,
} from "@/lib/account-credentials-validation";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

export type PasswordFormStrings = {
  currentPasswordLabel: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  passwordHelp: string;
  changePassword: string;
  changingPassword: string;
  passwordChanged: string;
  passwordRequired: string;
  passwordTooLong: string;
  newPasswordTooShort: string;
  newPasswordSame: string;
  passwordMismatch: string;
  passwordChangeFailed: string;
};

type FieldName = "current" | "next" | "confirmation";

function errorForField(
  field: FieldName,
  errors: Partial<Record<PasswordReplacementError, true>>,
  strings: PasswordFormStrings,
) {
  if (field === "current") {
    if (errors["current-required"]) return strings.passwordRequired;
    if (errors["current-too-long"]) return strings.passwordTooLong;
  }
  if (field === "next") {
    if (errors["new-required"]) return strings.passwordRequired;
    if (errors["new-too-short"]) return strings.newPasswordTooShort;
    if (errors["new-too-long"]) return strings.passwordTooLong;
    if (errors["same-password"]) return strings.newPasswordSame;
  }
  if (field === "confirmation") {
    if (errors["confirmation-required"]) return strings.passwordRequired;
    if (errors["confirmation-mismatch"]) return strings.passwordMismatch;
  }
  return "";
}

export function PasswordForm({ strings }: { strings: PasswordFormStrings }) {
  const router = useRouter();
  const currentId = useId();
  const nextId = useId();
  const nextHelpId = useId();
  const confirmationId = useId();
  const statusId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmationPassword, setConfirmationPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, true>>>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [serverMessage, setServerMessage] = useState("");
  const validation = validatePasswordReplacement({
    currentPassword,
    newPassword,
    confirmationPassword,
  });
  const errors = validation.ok ? {} : validation.errors;
  const currentError = touched.current
    ? errorForField("current", errors, strings)
    : "";
  const nextError = touched.next ? errorForField("next", errors, strings) : "";
  const confirmationError = touched.confirmation
    ? errorForField("confirmation", errors, strings)
    : "";

  function resetStatus() {
    setStatus("idle");
    setServerMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ current: true, next: true, confirmation: true });
    resetStatus();
    const result = validatePasswordReplacement({
      currentPassword,
      newPassword,
      confirmationPassword,
    });
    if (!result.ok) return;

    setPending(true);
    try {
      const response = await authClient.changePassword({
        currentPassword: result.value.currentPassword,
        newPassword: result.value.newPassword,
        revokeOtherSessions: true,
      });
      if (response.error) {
        setStatus("error");
        setServerMessage(strings.passwordChangeFailed);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmationPassword("");
      setTouched({});
      setStatus("success");
      setServerMessage(strings.passwordChanged);
      router.refresh();
    } catch {
      setStatus("error");
      setServerMessage(strings.passwordChangeFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-busy={pending}
      className={styles.credentialForm}
      noValidate
      onSubmit={handleSubmit}
    >
      <label className={styles.field} htmlFor={currentId}>
        <span>{strings.currentPasswordLabel}</span>
        <input
          aria-describedby={`${currentId}-help ${statusId}`}
          aria-invalid={Boolean(currentError) || undefined}
          autoComplete="current-password"
          data-state={currentError ? "error" : undefined}
          id={currentId}
          maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
          name="currentPassword"
          onBlur={() => setTouched((value) => ({ ...value, current: true }))}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            resetStatus();
          }}
          required
          type="password"
          value={currentPassword}
        />
      </label>
      <p className={styles.fieldHelp} id={`${currentId}-help`}>
        {currentError || "\u00a0"}
      </p>

      <label className={styles.field} htmlFor={nextId}>
        <span>{strings.newPasswordLabel}</span>
        <input
          aria-describedby={`${nextHelpId} ${statusId}`}
          aria-invalid={Boolean(nextError) || undefined}
          autoComplete="new-password"
          data-state={nextError ? "error" : undefined}
          id={nextId}
          maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
          minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
          name="newPassword"
          onBlur={() => setTouched((value) => ({ ...value, next: true }))}
          onChange={(event) => {
            setNewPassword(event.target.value);
            resetStatus();
          }}
          required
          type="password"
          value={newPassword}
        />
      </label>
      <p className={styles.fieldHelp} id={nextHelpId}>
        {nextError || strings.passwordHelp}
      </p>

      <label className={styles.field} htmlFor={confirmationId}>
        <span>{strings.confirmPasswordLabel}</span>
        <input
          aria-describedby={`${confirmationId}-help ${statusId}`}
          aria-invalid={Boolean(confirmationError) || undefined}
          autoComplete="new-password"
          data-state={confirmationError ? "error" : undefined}
          id={confirmationId}
          maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
          minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
          name="confirmationPassword"
          onBlur={() =>
            setTouched((value) => ({ ...value, confirmation: true }))
          }
          onChange={(event) => {
            setConfirmationPassword(event.target.value);
            resetStatus();
          }}
          required
          type="password"
          value={confirmationPassword}
        />
      </label>
      <p className={styles.fieldHelp} id={`${confirmationId}-help`}>
        {confirmationError || "\u00a0"}
      </p>

      <div className={styles.formFooter}>
        <button
          className={styles.primaryButton}
          data-loading={pending || undefined}
          disabled={pending}
          type="submit"
        >
          {pending ? strings.changingPassword : strings.changePassword}
        </button>
        <p
          className={styles.formStatus}
          data-status={status}
          id={statusId}
          role={status === "error" ? "alert" : "status"}
        >
          {serverMessage}
        </p>
      </div>
    </form>
  );
}
