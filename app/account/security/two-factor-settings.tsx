"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  validateAccountCurrentFactor,
  validateAccountTotpCode,
} from "@/lib/account-totp-validation";
import { type Locale } from "@/lib/i18n";
import { getAccountStrings } from "@/lib/i18n/account";
import styles from "../account.module.css";

interface Enrollment {
  qrDataUrl: string;
  setupKey: string;
}

type Notice = { tone: "error" | "success"; text: string } | null;

const lifecycleHeaders = {
  "x-cyfurden-factor-purpose": "account-totp-lifecycle",
};

async function postAuth<T>(
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const response = await fetch(`/api/auth${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
  };
  return { data, ok: response.ok };
}

export function TwoFactorSettings({
  credentialEnabled,
  initialEnabled,
  locale,
  platformGrantActive,
  platformSessionAuthenticated,
  returnTo,
}: {
  credentialEnabled: boolean;
  initialEnabled: boolean;
  locale: Locale;
  platformGrantActive: boolean;
  platformSessionAuthenticated: boolean;
  returnTo: string | null;
}) {
  const router = useRouter();
  const t = getAccountStrings(locale);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setFieldError = (name: string, error: string) => {
    setFieldErrors((current) => ({ ...current, [name]: error }));
  };

  const revalidateField = (name: string, error: string) => {
    if (Object.prototype.hasOwnProperty.call(fieldErrors, name)) {
      setFieldError(name, error);
    }
  };

  const passwordError = (value: string) => {
    if (!value) return t.passwordRequired;
    if (value.length > 128) return t.passwordTooLong;
    return "";
  };

  const factorError = (value: string) => {
    const result = validateAccountCurrentFactor(value);
    if (result.ok) return "";
    return result.errors["code-required"]
      ? t.twoFactorCodeRequired
      : t.twoFactorCodeInvalid;
  };

  const newCodeError = (value: string) => {
    const result = validateAccountTotpCode(value);
    if (result.ok) return "";
    return result.errors["code-required"]
      ? t.twoFactorCodeRequired
      : t.twoFactorCodeInvalid;
  };

  const verifyCurrentFactor = async (code: string, lifecycle: boolean) => {
    const normalized = validateAccountCurrentFactor(code);
    if (!normalized.ok) return false;
    const path = /^\d{6}$/u.test(normalized.value)
      ? "/two-factor/verify-totp"
      : "/two-factor/verify-backup-code";
    const result = await postAuth(
      path,
      { code: normalized.value, trustDevice: false },
      lifecycle ? lifecycleHeaders : undefined,
    );
    return result.ok;
  };

  const beginChange = async (
    event: FormEvent<HTMLFormElement>,
    purpose: "enable" | "resync",
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const currentFactorCode = String(data.get("currentFactorCode") ?? "");
    const passwordName = `${purpose}Password`;
    const factorName = `${purpose}Factor`;
    const passwordMessage = passwordError(currentPassword);
    const factorMessage =
      purpose === "resync" ? factorError(currentFactorCode) : "";
    setFieldErrors((current) => ({
      ...current,
      [passwordName]: passwordMessage,
      ...(purpose === "resync" ? { [factorName]: factorMessage } : {}),
    }));
    if (passwordMessage || factorMessage) return;
    setPending(true);
    setNotice(null);
    try {
      if (
        purpose === "resync" &&
        !(await verifyCurrentFactor(currentFactorCode, true))
      ) {
        setNotice({ tone: "error", text: t.twoFactorCurrentInvalid });
        return;
      }
      const result = await postAuth<{
        setupKey?: string;
        totpURI?: string;
      }>("/account/totp/begin", {
        currentPassword,
        purpose,
      });
      if (!result.ok || !result.data.setupKey || !result.data.totpURI) {
        setNotice({ tone: "error", text: t.twoFactorChangeFailed });
        return;
      }
      setEnrollment({
        qrDataUrl: await QRCode.toDataURL(result.data.totpURI, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 320,
        }),
        setupKey: result.data.setupKey,
      });
      setRecoveryCodes([]);
      setFieldErrors({});
    } catch {
      setNotice({ tone: "error", text: t.twoFactorChangeFailed });
    } finally {
      setPending(false);
    }
  };

  const confirmChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("newCode") ?? "");
    const codeMessage = newCodeError(code);
    setFieldError("newCode", codeMessage);
    if (codeMessage) return;
    setPending(true);
    setNotice(null);
    try {
      const result = await postAuth<{
        purpose?: "enable" | "resync";
        recoveryCodes?: string[];
      }>("/account/totp/confirm", {
        code: code.replace(/\s+/gu, ""),
      });
      if (!result.ok || !Array.isArray(result.data.recoveryCodes)) {
        setNotice({ tone: "error", text: t.twoFactorNewCodeInvalid });
        return;
      }
      setRecoveryCodes(result.data.recoveryCodes);
      setEnrollment(null);
      setEnabled(true);
      setFieldErrors({});
      setNotice({
        tone: "success",
        text: t.twoFactorRecoveryPending,
      });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: t.twoFactorChangeFailed });
    } finally {
      setPending(false);
    }
  };

  const cancelChange = async () => {
    setPending(true);
    setNotice(null);
    try {
      const result = await postAuth("/account/totp/cancel", {});
      if (!result.ok) {
        setNotice({ tone: "error", text: t.twoFactorChangeFailed });
        return;
      }
      setEnrollment(null);
      setFieldErrors({});
    } catch {
      setNotice({ tone: "error", text: t.twoFactorChangeFailed });
    } finally {
      setPending(false);
    }
  };

  const disable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const currentFactorCode = String(data.get("currentFactorCode") ?? "");
    const confirmDisable = data.get("confirmDisable") === "on";
    const passwordMessage = passwordError(currentPassword);
    const factorMessage = factorError(currentFactorCode);
    const confirmationMessage = confirmDisable
      ? ""
      : t.twoFactorDisableConfirmationRequired;
    setFieldErrors((current) => ({
      ...current,
      disablePassword: passwordMessage,
      disableFactor: factorMessage,
      disableConfirmation: confirmationMessage,
    }));
    if (passwordMessage || factorMessage || confirmationMessage) return;
    setPending(true);
    setNotice(null);
    try {
      if (!(await verifyCurrentFactor(currentFactorCode, true))) {
        setNotice({ tone: "error", text: t.twoFactorCurrentInvalid });
        return;
      }
      const result = await postAuth("/account/totp/disable", {
        currentPassword,
        currentFactorCode,
        confirmDisable: true,
      });
      if (!result.ok) {
        setNotice({
          tone: "error",
          text:
            result.data.code === "PLATFORM_TOTP_REQUIRED"
              ? t.twoFactorPlatformConstraint
              : t.twoFactorChangeFailed,
        });
        return;
      }
      setEnabled(false);
      setEnrollment(null);
      setRecoveryCodes([]);
      setFieldErrors({});
      setNotice({ tone: "success", text: t.twoFactorDisabledSuccess });
      form.reset();
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: t.twoFactorChangeFailed });
    } finally {
      setPending(false);
    }
  };

  const verifyPlatform = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(
      new FormData(event.currentTarget).get("currentFactorCode") ?? "",
    );
    const codeMessage = factorError(code);
    setFieldError("platformFactor", codeMessage);
    if (codeMessage) return;
    setPending(true);
    setNotice(null);
    try {
      if (!(await verifyCurrentFactor(code, false))) {
        setNotice({ tone: "error", text: t.twoFactorCurrentInvalid });
        return;
      }
      if (returnTo) router.push(returnTo);
    } catch {
      setNotice({ tone: "error", text: t.twoFactorChangeFailed });
    } finally {
      setPending(false);
    }
  };

  if (!credentialEnabled) {
    return (
      <p className={styles.readOnlyNote}>{t.twoFactorCredentialRequired}</p>
    );
  }

  if (returnTo) {
    return (
      <div className={styles.twoFactorControls}>
        <p className={styles.stateLine}>
          <span aria-hidden="true" data-state={enabled ? "ready" : "neutral"} />
          {recoveryCodes.length
            ? t.twoFactorRecoveryPending
            : enabled
              ? t.twoFactorEnabled
              : t.twoFactorDisabled}
        </p>
        {enabled ? (
          <form
            className={styles.credentialForm}
            noValidate
            onSubmit={verifyPlatform}
          >
            <label className={styles.field}>
              <span>{t.secondFactorLabel}</span>
              <input
                aria-describedby="platform-factor-help"
                aria-invalid={Boolean(fieldErrors.platformFactor)}
                autoComplete="one-time-code"
                disabled={pending}
                inputMode="text"
                maxLength={128}
                name="currentFactorCode"
                onBlur={(event) =>
                  setFieldError(
                    "platformFactor",
                    factorError(event.target.value),
                  )
                }
                onChange={(event) =>
                  revalidateField(
                    "platformFactor",
                    factorError(event.target.value),
                  )
                }
                placeholder={t.twoFactorCodePlaceholder}
                required
                type="text"
              />
              <span
                className={styles.fieldHelp}
                data-state={fieldErrors.platformFactor ? "error" : undefined}
                id="platform-factor-help"
              >
                {fieldErrors.platformFactor || t.secondFactorHelp}
              </span>
            </label>
            <div className={styles.formFooter}>
              <button
                className={styles.primaryButton}
                disabled={pending}
                type="submit"
              >
                {pending ? t.twoFactorVerifying : t.twoFactorVerifyPlatform}
              </button>
            </div>
          </form>
        ) : (
          <p className={styles.constraintNote}>
            {t.twoFactorPlatformEnableRequired}
          </p>
        )}
        {notice ? (
          <p
            className={styles.formStatus}
            data-status={notice.tone}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.twoFactorControls}>
      <p className={styles.stateLine}>
        <span aria-hidden="true" data-state={enabled ? "ready" : "neutral"} />
        {recoveryCodes.length
          ? t.twoFactorRecoveryPending
          : enabled
            ? t.twoFactorEnabled
            : t.twoFactorDisabled}
      </p>

      {!enabled && !enrollment ? (
        <div className={styles.controlBlock}>
          <h3>{t.twoFactorEnableTitle}</h3>
          <p>{t.twoFactorEnableBody}</p>
          <form
            className={styles.credentialForm}
            noValidate
            onSubmit={(event) => beginChange(event, "enable")}
          >
            <label className={styles.field}>
              <span>{t.currentPasswordLabel}</span>
              <input
                aria-describedby="enable-password-help"
                aria-invalid={Boolean(fieldErrors.enablePassword)}
                autoComplete="current-password"
                disabled={pending}
                maxLength={128}
                minLength={8}
                name="currentPassword"
                onBlur={(event) =>
                  setFieldError(
                    "enablePassword",
                    passwordError(event.target.value),
                  )
                }
                onChange={(event) =>
                  revalidateField(
                    "enablePassword",
                    passwordError(event.target.value),
                  )
                }
                required
                type="password"
              />
              <span
                className={styles.fieldHelp}
                data-state={fieldErrors.enablePassword ? "error" : undefined}
                id="enable-password-help"
              >
                {fieldErrors.enablePassword || t.twoFactorPasswordHelp}
              </span>
            </label>
            <div className={styles.formFooter}>
              <button
                className={styles.primaryButton}
                disabled={pending}
                type="submit"
              >
                {pending ? t.twoFactorStarting : t.twoFactorEnable}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {enrollment ? (
        <div className={styles.controlBlock}>
          <h3>{t.twoFactorScanTitle}</h3>
          <p>{t.twoFactorScanBody}</p>
          <div className={styles.twoFactorSetup}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={t.twoFactorQrAlt}
              className={styles.twoFactorQr}
              height={180}
              src={enrollment.qrDataUrl}
              width={180}
            />
            <div>
              <p className={styles.setupKeyLabel}>{t.twoFactorSetupKey}</p>
              <code className={styles.setupKey}>{enrollment.setupKey}</code>
              <p className={styles.fieldHelp}>{t.twoFactorSetupExpires}</p>
              <form
                className={styles.credentialForm}
                noValidate
                onSubmit={confirmChange}
              >
                <label className={styles.field}>
                  <span>{t.twoFactorNewCodeLabel}</span>
                  <input
                    aria-describedby="new-code-help"
                    aria-invalid={Boolean(fieldErrors.newCode)}
                    autoComplete="one-time-code"
                    disabled={pending}
                    inputMode="numeric"
                    maxLength={6}
                    minLength={6}
                    name="newCode"
                    onBlur={(event) =>
                      setFieldError("newCode", newCodeError(event.target.value))
                    }
                    onChange={(event) =>
                      revalidateField(
                        "newCode",
                        newCodeError(event.target.value),
                      )
                    }
                    pattern="[0-9]{6}"
                    placeholder={t.twoFactorCodePlaceholder}
                    required
                    type="text"
                  />
                  <span
                    className={styles.fieldHelp}
                    data-state={fieldErrors.newCode ? "error" : undefined}
                    id="new-code-help"
                  >
                    {fieldErrors.newCode || t.twoFactorNewCodeHelp}
                  </span>
                </label>
                <div className={styles.formFooter}>
                  <button
                    className={styles.primaryButton}
                    disabled={pending}
                    type="submit"
                  >
                    {pending ? t.twoFactorVerifying : t.twoFactorConfirm}
                  </button>
                  <button
                    className={styles.textButton}
                    disabled={pending}
                    onClick={cancelChange}
                    type="button"
                  >
                    {t.cancel}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {enabled && !enrollment && !recoveryCodes.length ? (
        <div className={styles.controlGrid}>
          <div className={styles.controlBlock}>
            <h3>{t.twoFactorResyncTitle}</h3>
            <p>{t.twoFactorResyncBody}</p>
            <form
              className={styles.credentialForm}
              noValidate
              onSubmit={(event) => beginChange(event, "resync")}
            >
              <label className={styles.field}>
                <span>{t.currentPasswordLabel}</span>
                <input
                  aria-describedby="resync-password-help"
                  aria-invalid={Boolean(fieldErrors.resyncPassword)}
                  autoComplete="current-password"
                  disabled={pending}
                  maxLength={128}
                  name="currentPassword"
                  onBlur={(event) =>
                    setFieldError(
                      "resyncPassword",
                      passwordError(event.target.value),
                    )
                  }
                  onChange={(event) =>
                    revalidateField(
                      "resyncPassword",
                      passwordError(event.target.value),
                    )
                  }
                  required
                  type="password"
                />
                <span
                  className={styles.fieldHelp}
                  data-state={fieldErrors.resyncPassword ? "error" : undefined}
                  id="resync-password-help"
                >
                  {fieldErrors.resyncPassword || t.twoFactorPasswordHelp}
                </span>
              </label>
              <label className={styles.field}>
                <span>{t.secondFactorLabel}</span>
                <input
                  aria-describedby="resync-factor-help"
                  aria-invalid={Boolean(fieldErrors.resyncFactor)}
                  autoComplete="one-time-code"
                  disabled={pending}
                  inputMode="text"
                  maxLength={128}
                  name="currentFactorCode"
                  onBlur={(event) =>
                    setFieldError(
                      "resyncFactor",
                      factorError(event.target.value),
                    )
                  }
                  onChange={(event) =>
                    revalidateField(
                      "resyncFactor",
                      factorError(event.target.value),
                    )
                  }
                  placeholder={t.twoFactorCodePlaceholder}
                  required
                  type="text"
                />
                <span
                  className={styles.fieldHelp}
                  data-state={fieldErrors.resyncFactor ? "error" : undefined}
                  id="resync-factor-help"
                >
                  {fieldErrors.resyncFactor || t.secondFactorHelp}
                </span>
              </label>
              <div className={styles.formFooter}>
                <button
                  className={styles.primaryButton}
                  disabled={pending}
                  type="submit"
                >
                  {pending ? t.twoFactorStarting : t.twoFactorResync}
                </button>
              </div>
            </form>
          </div>

          <div className={styles.controlBlock}>
            <h3>{t.twoFactorDisableTitle}</h3>
            <p>{t.twoFactorDisableBody}</p>
            {platformGrantActive ? (
              <p className={styles.constraintNote}>
                {t.twoFactorPlatformConstraint}
              </p>
            ) : (
              <form
                className={styles.credentialForm}
                noValidate
                onSubmit={disable}
              >
                <label className={styles.field}>
                  <span>{t.currentPasswordLabel}</span>
                  <input
                    aria-describedby="disable-password-help"
                    aria-invalid={Boolean(fieldErrors.disablePassword)}
                    autoComplete="current-password"
                    disabled={pending}
                    maxLength={128}
                    name="currentPassword"
                    onBlur={(event) =>
                      setFieldError(
                        "disablePassword",
                        passwordError(event.target.value),
                      )
                    }
                    onChange={(event) =>
                      revalidateField(
                        "disablePassword",
                        passwordError(event.target.value),
                      )
                    }
                    required
                    type="password"
                  />
                  <span
                    className={styles.fieldHelp}
                    data-state={
                      fieldErrors.disablePassword ? "error" : undefined
                    }
                    id="disable-password-help"
                  >
                    {fieldErrors.disablePassword || t.twoFactorPasswordHelp}
                  </span>
                </label>
                <label className={styles.field}>
                  <span>{t.secondFactorLabel}</span>
                  <input
                    aria-describedby="disable-factor-help"
                    aria-invalid={Boolean(fieldErrors.disableFactor)}
                    autoComplete="one-time-code"
                    disabled={pending}
                    inputMode="text"
                    maxLength={128}
                    name="currentFactorCode"
                    onBlur={(event) =>
                      setFieldError(
                        "disableFactor",
                        factorError(event.target.value),
                      )
                    }
                    onChange={(event) =>
                      revalidateField(
                        "disableFactor",
                        factorError(event.target.value),
                      )
                    }
                    placeholder={t.twoFactorCodePlaceholder}
                    required
                    type="text"
                  />
                  <span
                    className={styles.fieldHelp}
                    data-state={fieldErrors.disableFactor ? "error" : undefined}
                    id="disable-factor-help"
                  >
                    {fieldErrors.disableFactor || t.secondFactorHelp}
                  </span>
                </label>
                <label className={styles.confirmationField}>
                  <input
                    aria-describedby="disable-confirmation-help"
                    aria-invalid={Boolean(fieldErrors.disableConfirmation)}
                    disabled={pending}
                    name="confirmDisable"
                    onBlur={(event) =>
                      setFieldError(
                        "disableConfirmation",
                        event.target.checked
                          ? ""
                          : t.twoFactorDisableConfirmationRequired,
                      )
                    }
                    onChange={(event) =>
                      revalidateField(
                        "disableConfirmation",
                        event.target.checked
                          ? ""
                          : t.twoFactorDisableConfirmationRequired,
                      )
                    }
                    required
                    type="checkbox"
                  />
                  <span>{t.twoFactorDisableConfirmation}</span>
                </label>
                <p
                  className={styles.fieldHelp}
                  data-state={
                    fieldErrors.disableConfirmation ? "error" : undefined
                  }
                  id="disable-confirmation-help"
                >
                  {fieldErrors.disableConfirmation}
                </p>
                <p className={styles.destructiveNote}>
                  {t.twoFactorDisableWarning}
                </p>
                <div className={styles.formFooter}>
                  <button
                    className={styles.dangerButton}
                    disabled={pending}
                    type="submit"
                  >
                    {pending ? t.twoFactorDisabling : t.twoFactorDisable}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {platformGrantActive && !platformSessionAuthenticated && enabled ? (
        <p className={styles.constraintNote}>
          {t.twoFactorPlatformRefreshNote}{" "}
          <a href="/account/security?returnTo=/admin">
            {t.twoFactorVerifyPlatform}
          </a>
        </p>
      ) : null}

      {notice ? (
        <p
          className={styles.formStatus}
          data-status={notice.tone}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      {recoveryCodes.length ? (
        <div className={styles.controlBlock}>
          <h3>{t.twoFactorRecoveryTitle}</h3>
          <p>{t.twoFactorRecoveryBody}</p>
          <ul className={styles.recoveryCodes}>
            {recoveryCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <button
            className={styles.primaryButton}
            onClick={() => setRecoveryCodes([])}
            type="button"
          >
            {t.twoFactorRecoverySaved}
          </button>
        </div>
      ) : null}
    </div>
  );
}
