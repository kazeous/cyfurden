"use client";

import { useId, useState, type FormEvent } from "react";
import {
  ACCOUNT_EMAIL_MAX_INPUT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_SECOND_FACTOR_MAX_LENGTH,
  validateEmailReplacement,
  type EmailReplacementError,
} from "@/lib/account-credentials-validation";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

export type EmailFormStrings = {
  newEmailLabel: string;
  confirmEmailLabel: string;
  currentPasswordLabel: string;
  secondFactorLabel: string;
  secondFactorHelp: string;
  changeEmailWarning: string;
  changeEmail: string;
  changingEmail: string;
  emailRequired: string;
  emailInvalid: string;
  emailTooLong: string;
  emailSame: string;
  emailMismatch: string;
  passwordRequired: string;
  passwordTooLong: string;
  secondFactorRequired: string;
  emailChangeFailed: string;
};

type FieldName = "email" | "confirmation" | "password" | "secondFactor";

function errorForField(
  field: FieldName,
  errors: Partial<Record<EmailReplacementError, true>>,
  strings: EmailFormStrings,
) {
  if (field === "email") {
    if (errors["email-required"]) return strings.emailRequired;
    if (errors["email-invalid"]) return strings.emailInvalid;
    if (errors["email-too-long"]) return strings.emailTooLong;
    if (errors["same-email"]) return strings.emailSame;
  }
  if (field === "confirmation") {
    if (errors["confirmation-required"]) return strings.emailRequired;
    if (errors["confirmation-mismatch"]) return strings.emailMismatch;
  }
  if (field === "password") {
    if (errors["password-required"]) return strings.passwordRequired;
    if (errors["password-too-long"]) return strings.passwordTooLong;
  }
  if (field === "secondFactor") {
    if (errors["second-factor-required"]) return strings.secondFactorRequired;
    if (errors["second-factor-too-long"]) return strings.secondFactorRequired;
  }
  return "";
}

export function EmailForm({
  currentEmail,
  strings,
  twoFactorRequired,
}: {
  currentEmail: string;
  strings: EmailFormStrings;
  twoFactorRequired: boolean;
}) {
  const emailId = useId();
  const confirmationId = useId();
  const passwordId = useId();
  const secondFactorId = useId();
  const statusId = useId();
  const [newEmail, setNewEmail] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, true>>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const validation = validateEmailReplacement({
    currentEmail,
    newEmail,
    confirmationEmail,
    currentPassword,
    secondFactorCode,
    twoFactorRequired,
  });
  const errors = validation.ok ? {} : validation.errors;
  const emailError = touched.email
    ? errorForField("email", errors, strings)
    : "";
  const confirmationError = touched.confirmation
    ? errorForField("confirmation", errors, strings)
    : "";
  const passwordError = touched.password
    ? errorForField("password", errors, strings)
    : "";
  const secondFactorError = touched.secondFactor
    ? errorForField("secondFactor", errors, strings)
    : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      email: true,
      confirmation: true,
      password: true,
      ...(twoFactorRequired ? { secondFactor: true } : {}),
    });
    setMessage("");
    const result = validateEmailReplacement({
      currentEmail,
      newEmail,
      confirmationEmail,
      currentPassword,
      secondFactorCode,
      twoFactorRequired,
    });
    if (!result.ok) return;

    setPending(true);
    try {
      const response = await authClient.$fetch<{ status: true }>(
        "/account/change-email",
        {
          method: "POST",
          body: {
            newEmail: result.value.newEmail,
            confirmationEmail: result.value.confirmationEmail,
            currentPassword: result.value.currentPassword,
            ...(result.value.secondFactorCode
              ? { secondFactorCode: result.value.secondFactorCode }
              : {}),
          },
        },
      );
      if (response.error || !response.data?.status) {
        setMessage(strings.emailChangeFailed);
        return;
      }
      window.location.replace("/sign-in?notice=email-changed");
    } catch {
      setMessage(strings.emailChangeFailed);
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
      <p className={styles.constraintNote}>{strings.changeEmailWarning}</p>

      <label className={styles.field} htmlFor={emailId}>
        <span>{strings.newEmailLabel}</span>
        <input
          aria-describedby={`${emailId}-help ${statusId}`}
          aria-invalid={Boolean(emailError) || undefined}
          autoCapitalize="none"
          autoComplete="email"
          data-state={emailError ? "error" : undefined}
          id={emailId}
          inputMode="email"
          maxLength={ACCOUNT_EMAIL_MAX_INPUT}
          name="newEmail"
          onBlur={() => setTouched((value) => ({ ...value, email: true }))}
          onChange={(event) => {
            setNewEmail(event.target.value);
            setMessage("");
          }}
          required
          spellCheck={false}
          type="email"
          value={newEmail}
        />
      </label>
      <p className={styles.fieldHelp} id={`${emailId}-help`}>
        {emailError || "\u00a0"}
      </p>

      <label className={styles.field} htmlFor={confirmationId}>
        <span>{strings.confirmEmailLabel}</span>
        <input
          aria-describedby={`${confirmationId}-help ${statusId}`}
          aria-invalid={Boolean(confirmationError) || undefined}
          autoCapitalize="none"
          autoComplete="email"
          data-state={confirmationError ? "error" : undefined}
          id={confirmationId}
          inputMode="email"
          maxLength={ACCOUNT_EMAIL_MAX_INPUT}
          name="confirmationEmail"
          onBlur={() =>
            setTouched((value) => ({ ...value, confirmation: true }))
          }
          onChange={(event) => {
            setConfirmationEmail(event.target.value);
            setMessage("");
          }}
          required
          spellCheck={false}
          type="email"
          value={confirmationEmail}
        />
      </label>
      <p className={styles.fieldHelp} id={`${confirmationId}-help`}>
        {confirmationError || "\u00a0"}
      </p>

      <label className={styles.field} htmlFor={passwordId}>
        <span>{strings.currentPasswordLabel}</span>
        <input
          aria-describedby={`${passwordId}-help ${statusId}`}
          aria-invalid={Boolean(passwordError) || undefined}
          autoComplete="current-password"
          data-state={passwordError ? "error" : undefined}
          id={passwordId}
          maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
          name="currentPassword"
          onBlur={() => setTouched((value) => ({ ...value, password: true }))}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            setMessage("");
          }}
          required
          type="password"
          value={currentPassword}
        />
      </label>
      <p className={styles.fieldHelp} id={`${passwordId}-help`}>
        {passwordError || "\u00a0"}
      </p>

      {twoFactorRequired ? (
        <>
          <label className={styles.field} htmlFor={secondFactorId}>
            <span>{strings.secondFactorLabel}</span>
            <input
              aria-describedby={`${secondFactorId}-help ${statusId}`}
              aria-invalid={Boolean(secondFactorError) || undefined}
              autoComplete="one-time-code"
              data-state={secondFactorError ? "error" : undefined}
              id={secondFactorId}
              maxLength={ACCOUNT_SECOND_FACTOR_MAX_LENGTH}
              name="secondFactorCode"
              onBlur={() =>
                setTouched((value) => ({ ...value, secondFactor: true }))
              }
              onChange={(event) => {
                setSecondFactorCode(event.target.value);
                setMessage("");
              }}
              required
              spellCheck={false}
              type="text"
              value={secondFactorCode}
            />
          </label>
          <p className={styles.fieldHelp} id={`${secondFactorId}-help`}>
            {secondFactorError || strings.secondFactorHelp}
          </p>
        </>
      ) : null}

      <div className={styles.formFooter}>
        <button
          className={styles.primaryButton}
          data-loading={pending || undefined}
          disabled={pending}
          type="submit"
        >
          {pending ? strings.changingEmail : strings.changeEmail}
        </button>
        <p
          className={styles.formStatus}
          data-status={message ? "error" : "idle"}
          id={statusId}
          role={message ? "alert" : "status"}
        >
          {message}
        </p>
      </div>
    </form>
  );
}
