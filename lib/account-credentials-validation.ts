import { z } from "zod";

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 128;
export const ACCOUNT_EMAIL_MAX_INPUT = 320;
export const ACCOUNT_EMAIL_MAX_LENGTH = 254;
export const ACCOUNT_SECOND_FACTOR_MAX_LENGTH = 128;

export type PasswordReplacementError =
  | "current-required"
  | "current-too-long"
  | "new-required"
  | "new-too-short"
  | "new-too-long"
  | "same-password"
  | "confirmation-required"
  | "confirmation-mismatch";

export type EmailReplacementError =
  | "email-required"
  | "email-invalid"
  | "email-too-long"
  | "same-email"
  | "confirmation-required"
  | "confirmation-mismatch"
  | "password-required"
  | "password-too-long"
  | "second-factor-required"
  | "second-factor-too-long";

export type PasswordReplacementInput = {
  currentPassword: unknown;
  newPassword: unknown;
  confirmationPassword: unknown;
};

export type EmailReplacementInput = {
  currentEmail: unknown;
  newEmail: unknown;
  confirmationEmail: unknown;
  currentPassword: unknown;
  secondFactorCode?: unknown;
  twoFactorRequired: boolean;
};

export type ValidationResult<TValue, TError extends string> =
  | { ok: true; value: TValue }
  | { ok: false; errors: Partial<Record<TError, true>> };

export function validatePasswordReplacement(
  input: PasswordReplacementInput,
): ValidationResult<
  {
    currentPassword: string;
    newPassword: string;
    confirmationPassword: string;
  },
  PasswordReplacementError
> {
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword =
    typeof input.newPassword === "string" ? input.newPassword : "";
  const confirmationPassword =
    typeof input.confirmationPassword === "string"
      ? input.confirmationPassword
      : "";
  const errors: Partial<Record<PasswordReplacementError, true>> = {};

  if (!currentPassword) errors["current-required"] = true;
  if (currentPassword.length > ACCOUNT_PASSWORD_MAX_LENGTH) {
    errors["current-too-long"] = true;
  }
  if (!newPassword) errors["new-required"] = true;
  if (newPassword && newPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
    errors["new-too-short"] = true;
  }
  if (newPassword.length > ACCOUNT_PASSWORD_MAX_LENGTH) {
    errors["new-too-long"] = true;
  }
  if (currentPassword && newPassword === currentPassword) {
    errors["same-password"] = true;
  }
  if (!confirmationPassword) errors["confirmation-required"] = true;
  if (confirmationPassword && newPassword !== confirmationPassword) {
    errors["confirmation-mismatch"] = true;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { currentPassword, newPassword, confirmationPassword },
  };
}

export function normalizeAccountEmail(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

export function validateEmailReplacement(
  input: EmailReplacementInput,
): ValidationResult<
  {
    newEmail: string;
    confirmationEmail: string;
    currentPassword: string;
    secondFactorCode: string | null;
  },
  EmailReplacementError
> {
  const rawEmail = typeof input.newEmail === "string" ? input.newEmail : "";
  const rawConfirmation =
    typeof input.confirmationEmail === "string" ? input.confirmationEmail : "";
  const currentEmail =
    typeof input.currentEmail === "string"
      ? normalizeAccountEmail(input.currentEmail)
      : "";
  const newEmail = normalizeAccountEmail(rawEmail);
  const confirmationEmail = normalizeAccountEmail(rawConfirmation);
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  const secondFactorCode =
    typeof input.secondFactorCode === "string"
      ? input.secondFactorCode.trim()
      : "";
  const errors: Partial<Record<EmailReplacementError, true>> = {};

  if (!newEmail) errors["email-required"] = true;
  if (
    rawEmail.length > ACCOUNT_EMAIL_MAX_INPUT ||
    newEmail.length > ACCOUNT_EMAIL_MAX_LENGTH
  ) {
    errors["email-too-long"] = true;
  } else if (newEmail && !z.email().safeParse(newEmail).success) {
    errors["email-invalid"] = true;
  }
  if (newEmail && currentEmail && newEmail === currentEmail) {
    errors["same-email"] = true;
  }
  if (!confirmationEmail) errors["confirmation-required"] = true;
  if (confirmationEmail && newEmail !== confirmationEmail) {
    errors["confirmation-mismatch"] = true;
  }
  if (!currentPassword) errors["password-required"] = true;
  if (currentPassword.length > ACCOUNT_PASSWORD_MAX_LENGTH) {
    errors["password-too-long"] = true;
  }
  if (input.twoFactorRequired && !secondFactorCode) {
    errors["second-factor-required"] = true;
  }
  if (secondFactorCode.length > ACCOUNT_SECOND_FACTOR_MAX_LENGTH) {
    errors["second-factor-too-long"] = true;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      newEmail,
      confirmationEmail,
      currentPassword,
      secondFactorCode: secondFactorCode || null,
    },
  };
}
