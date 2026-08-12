"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { translate, type Locale } from "@/lib/i18n";
import { safeReturnTo } from "@/lib/redirect";
import styles from "./auth.module.css";

export function TwoFactorForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = translate(locale, "publicAuth");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .replace(/\s+/g, "")
      .trim();
    if (!/^\d{6}$/.test(code)) {
      setError(t.twoFactorInvalid);
      return;
    }

    setPending(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: false,
      });
      if (result.error) {
        const errorCode = String(result.error.code ?? "").toUpperCase();
        setError(
          errorCode.includes("COOKIE") || errorCode.includes("EXPIRED")
            ? t.twoFactorExpired
            : t.twoFactorInvalid,
        );
        return;
      }

      const destination = safeReturnTo(
        window.sessionStorage.getItem("cyfurden:auth-return-to") ?? undefined,
        "/dashboard",
      );
      window.sessionStorage.removeItem("cyfurden:auth-return-to");
      router.replace(destination);
      router.refresh();
    } catch {
      setError(t.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.formPanel}>
      <div className={styles.formHeading}>
        <p className={styles.eyebrow}>{t.twoFactorEyebrow}</p>
        <h1>{t.twoFactorTitle}</h1>
        <p>{t.twoFactorBody}</p>
      </div>

      <form aria-busy={pending} className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>{t.twoFactorCodeLabel}</span>
          <input
            autoComplete="one-time-code"
            autoFocus
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

        <p
          aria-live="polite"
          className={`${styles.message} ${error ? styles.messageVisible : ""}`}
          role={error ? "alert" : undefined}
        >
          {error || "\u00a0"}
        </p>

        <button
          className={styles.submitButton}
          disabled={pending}
          type="submit"
        >
          {pending ? t.twoFactorPending : t.twoFactorSubmit}
        </button>
      </form>

      <p className={styles.switchPrompt}>
        <Link href="/sign-in">{t.twoFactorBackToSignIn}</Link>
      </p>
    </div>
  );
}
