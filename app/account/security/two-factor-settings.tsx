"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { translate, type Locale } from "@/lib/i18n";
import styles from "./security.module.css";

interface Enrollment {
  backupCodes: string[];
  qrDataUrl: string;
  totpURI: string;
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
  const t = translate(locale, "publicAuth");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const beginEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setSuccess(false);
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    try {
      const result = await authClient.twoFactor.enable({
        issuer: "Cyfurden",
        password,
      });
      if (result.error || !result.data) {
        setMessage(t.errorGeneric);
        return;
      }
      setEnrollment({
        backupCodes: result.data.backupCodes,
        qrDataUrl: await QRCode.toDataURL(result.data.totpURI, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 320,
        }),
        totpURI: result.data.totpURI,
      });
    } catch {
      setMessage(t.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setSuccess(false);
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .replace(/\s+/g, "")
      .trim();
    if (!/^\d{6}$/.test(code)) {
      setMessage(t.twoFactorInvalid);
      setPending(false);
      return;
    }
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: false,
      });
      if (result.error) {
        setMessage(t.twoFactorInvalid);
        return;
      }
      if (enrollment) {
        setBackupCodes(enrollment.backupCodes);
        setEnrollment(null);
        setEnabled(true);
        setMessage(t.securityComplete);
      } else {
        setMessage(t.securityRefreshed);
      }
      setSuccess(true);
      if (returnTo) {
        router.push(returnTo);
        return;
      }
      router.refresh();
    } catch {
      setMessage(t.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  if (!credentialEnabled) {
    return <p className={styles.message}>{t.securityCredentialRequired}</p>;
  }

  return (
    <>
      <p className={styles.status}>
        {enabled ? t.securityEnabled : t.securityDisabled}
      </p>

      {!enabled && !enrollment ? (
        <section className={styles.panel}>
          <form className={styles.form} onSubmit={beginEnrollment}>
            <label className={styles.field}>
              <span>{t.securityPasswordLabel}</span>
              <input
                autoComplete="current-password"
                disabled={pending}
                maxLength={128}
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            <button className={styles.button} disabled={pending} type="submit">
              {pending ? t.securityEnabling : t.securityEnable}
            </button>
          </form>
        </section>
      ) : null}

      {enrollment ? (
        <section className={styles.panel}>
          <h2>{t.securityScanTitle}</h2>
          <p>{t.securityScanBody}</p>
          <div className={styles.setup}>
            {/* The data URL contains only the user's just-created TOTP URI. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={t.securityQrAlt}
              className={styles.qr}
              height={180}
              src={enrollment.qrDataUrl}
              width={180}
            />
            <div>
              <code className={styles.uri}>{enrollment.totpURI}</code>
              <form className={styles.form} onSubmit={verifyCode}>
                <label className={styles.field}>
                  <span>{t.twoFactorCodeLabel}</span>
                  <input
                    autoComplete="one-time-code"
                    disabled={pending}
                    inputMode="numeric"
                    maxLength={6}
                    minLength={6}
                    name="code"
                    pattern="[0-9]{6}"
                    placeholder={t.twoFactorCodePlaceholder}
                    required
                    type="text"
                  />
                </label>
                <button
                  className={styles.button}
                  disabled={pending}
                  type="submit"
                >
                  {pending ? t.securityVerifying : t.securityVerify}
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : null}

      {enabled &&
      !enrollment &&
      platformGrantActive &&
      platformSessionAuthenticated ? (
        <section className={styles.panel}>
          <h2>{t.securityRefreshTitle}</h2>
          <p>{t.securityRefreshBody}</p>
          <form className={styles.form} onSubmit={verifyCode}>
            <label className={styles.field}>
              <span>{t.twoFactorCodeLabel}</span>
              <input
                autoComplete="one-time-code"
                disabled={pending}
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="code"
                pattern="[0-9]{6}"
                placeholder={t.twoFactorCodePlaceholder}
                required
                type="text"
              />
            </label>
            <button className={styles.button} disabled={pending} type="submit">
              {pending ? t.securityVerifying : t.twoFactorSubmit}
            </button>
          </form>
        </section>
      ) : null}

      {enabled &&
      !enrollment &&
      platformGrantActive &&
      !platformSessionAuthenticated ? (
        <p className={styles.message}>{t.securityCredentialSignInRequired}</p>
      ) : null}

      {message ? (
        <p
          className={`${styles.message} ${success ? styles.success : ""}`}
          role={success ? "status" : "alert"}
        >
          {message}
        </p>
      ) : null}

      {backupCodes.length ? (
        <section className={styles.panel}>
          <h2>{t.securityBackupTitle}</h2>
          <p>{t.securityBackupBody}</p>
          <ul className={styles.backupCodes}>
            {backupCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
