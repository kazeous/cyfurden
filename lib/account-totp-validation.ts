import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  type ValidationResult,
} from "@/lib/account-credentials-validation";

export const ACCOUNT_TOTP_CODE_LENGTH = 6;
export const ACCOUNT_TOTP_FACTOR_MAX_LENGTH = 128;

export type AccountTotpPurpose = "enable" | "resync";

export type AccountTotpBeginError =
  | "password-required"
  | "password-too-long"
  | "purpose-invalid";

export type AccountTotpCodeError = "code-required" | "code-invalid";

export type AccountTotpDisableError =
  | AccountTotpBeginError
  | AccountTotpCodeError
  | "confirmation-required";

export function normalizeAccountFactorCode(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateAccountTotpBegin(input: {
  currentPassword: unknown;
  purpose: unknown;
}): ValidationResult<
  { currentPassword: string; purpose: AccountTotpPurpose },
  AccountTotpBeginError
> {
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  const errors: Partial<Record<AccountTotpBeginError, true>> = {};

  if (!currentPassword) errors["password-required"] = true;
  if (currentPassword.length > ACCOUNT_PASSWORD_MAX_LENGTH) {
    errors["password-too-long"] = true;
  }
  if (input.purpose !== "enable" && input.purpose !== "resync") {
    errors["purpose-invalid"] = true;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      currentPassword,
      purpose: input.purpose as AccountTotpPurpose,
    },
  };
}

export function validateAccountTotpCode(
  input: unknown,
): ValidationResult<string, AccountTotpCodeError> {
  const code = normalizeAccountFactorCode(input).replace(/\s+/gu, "");
  const errors: Partial<Record<AccountTotpCodeError, true>> = {};

  if (!code) errors["code-required"] = true;
  if (code && !/^\d{6}$/u.test(code)) errors["code-invalid"] = true;

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: code };
}

export function validateAccountCurrentFactor(
  input: unknown,
): ValidationResult<string, AccountTotpCodeError> {
  const code = normalizeAccountFactorCode(input);
  const errors: Partial<Record<AccountTotpCodeError, true>> = {};

  if (!code) errors["code-required"] = true;
  if (
    code &&
    !/^\d{6}$/u.test(code) &&
    !/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/u.test(code)
  ) {
    errors["code-invalid"] = true;
  }
  if (code.length > ACCOUNT_TOTP_FACTOR_MAX_LENGTH) {
    errors["code-invalid"] = true;
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: code };
}

export function validateAccountTotpDisable(input: {
  currentPassword: unknown;
  currentFactorCode: unknown;
  confirmDisable: unknown;
}): ValidationResult<
  {
    currentPassword: string;
    currentFactorCode: string;
    confirmDisable: true;
  },
  AccountTotpDisableError
> {
  const password = validateAccountTotpBegin({
    currentPassword: input.currentPassword,
    purpose: "resync",
  });
  const factor = validateAccountCurrentFactor(input.currentFactorCode);
  const errors: Partial<Record<AccountTotpDisableError, true>> = {};

  if (!password.ok) Object.assign(errors, password.errors);
  if (!factor.ok) Object.assign(errors, factor.errors);
  if (input.confirmDisable !== true) errors["confirmation-required"] = true;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      currentPassword: password.ok ? password.value.currentPassword : "",
      currentFactorCode: factor.ok ? factor.value : "",
      confirmDisable: true,
    },
  };
}
