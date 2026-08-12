"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { translate, type Locale } from "@/lib/i18n";
import { safeReturnTo } from "@/lib/redirect";
import styles from "./auth.module.css";

type AuthMode = "sign-in" | "sign-up";

interface AuthFormProps {
  googleEnabled: boolean;
  mode: AuthMode;
  returnTo?: string;
  locale?: Locale;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className={styles.googleIcon} viewBox="0 0 24 24">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.31 2.98-7.34Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.39 13.89A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.89V7.52H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.48l3.35-2.59Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.97c1.47 0 2.78.5 3.82 1.49l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.59C7.18 7.74 9.39 5.97 12 5.97Z"
      />
    </svg>
  );
}

export function AuthForm({
  googleEnabled,
  mode,
  returnTo,
  locale = "en",
}: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const t = translate(locale, "publicAuth");
  const signInLabel = t.signInGoogleButton;
  const signUpLabel = t.signUpGoogleButton;
  const googleButtonLabel = isSignUp ? signUpLabel : signInLabel;
  const eyebrow = isSignUp ? t.formEyebrow.signUp : t.formEyebrow.signIn;
  const heading = isSignUp ? t.formHeading.signUp : t.formHeading.signIn;
  const body = isSignUp ? t.formBody.signUp : t.formBody.signIn;
  const passwordPlaceholder = isSignUp
    ? t.passwordPlaceholder.signUp
    : t.passwordPlaceholder.signIn;
  const submitPendingLabel = isSignUp
    ? t.submitPending.signUp
    : t.submitPending.signIn;
  const switchPrompt = isSignUp ? t.switchPrompt.signUp : t.switchPrompt.signIn;
  const switchLink = isSignUp ? t.switchLink.signUp : t.switchLink.signIn;
  const emailLabel = isSignUp ? t.signUpEmailLabel : t.signInEmailLabel;
  const passwordLabel = isSignUp
    ? t.signUpPasswordLabel
    : t.signInPasswordLabel;
  const submitLabel = isSignUp ? t.signUpSubmit : t.signInSubmit;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const destination = safeReturnTo(returnTo, "/dashboard");
  const alternateAuthHref = `${isSignUp ? "/sign-in" : "/sign-up"}?returnTo=${encodeURIComponent(destination)}`;

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (isSignUp) {
      const passwordConfirmation = String(
        form.get("passwordConfirmation") ?? "",
      );

      if (password !== passwordConfirmation) {
        setError(t.errorPasswordMismatch);
        return;
      }
    }

    setPending(true);

    try {
      if (!isSignUp) {
        window.sessionStorage.setItem("cyfurden:auth-return-to", destination);
      }
      const result = isSignUp
        ? await signUp.email({
            callbackURL: destination,
            email,
            name: String(form.get("name") ?? "").trim(),
            password,
          })
        : await signIn.email({
            callbackURL: destination,
            email,
            password,
          });

      if (result.error) {
        const errorCode = String(result.error.code ?? "").toUpperCase();
        setError(
          isSignUp && errorCode.includes("USER_ALREADY_EXISTS")
            ? t.signUpErrorExists
            : isSignUp
              ? t.signUpErrorGeneric
              : t.signInErrorInvalid,
        );
        return;
      }

      if (
        !isSignUp &&
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect === true
      ) {
        return;
      }

      window.sessionStorage.removeItem("cyfurden:auth-return-to");
      router.replace(destination);
      router.refresh();
    } catch {
      setError(t.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setPending(true);
    setError("");

    try {
      const result = await signIn.social({
        callbackURL: destination,
        provider: "google",
      });

      if (result?.error) {
        setError(t.errorGoogleUnavailable);
        setPending(false);
      }
    } catch {
      setError(t.errorGoogleUnavailable);
      setPending(false);
    }
  };

  return (
    <div className={styles.formPanel}>
      <div className={styles.formHeading}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{heading}</h1>
        <p>{body}</p>
      </div>

      {googleEnabled ? (
        <>
          <button
            className={styles.googleButton}
            disabled={pending}
            onClick={handleGoogleSignIn}
            type="button"
          >
            <GoogleIcon />
            {googleButtonLabel}
          </button>
          <div className={styles.divider} aria-hidden="true">
            <span>{t.dividerOrEmail}</span>
          </div>
        </>
      ) : null}

      <form
        aria-busy={pending}
        className={styles.form}
        onSubmit={handleEmailSubmit}
      >
        {isSignUp ? (
          <label className={styles.field}>
            <span>{t.signUpNameLabel}</span>
            <input
              autoComplete="name"
              disabled={pending}
              maxLength={80}
              minLength={2}
              name="name"
              placeholder={t.namePlaceholder}
              required
              type="text"
            />
          </label>
        ) : null}

        <label className={styles.field}>
          <span>{emailLabel}</span>
          <input
            autoCapitalize="none"
            autoComplete="email"
            disabled={pending}
            inputMode="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>

        <label className={styles.field}>
          <span>{passwordLabel}</span>
          <input
            autoComplete={isSignUp ? "new-password" : "current-password"}
            disabled={pending}
            maxLength={128}
            minLength={8}
            name="password"
            placeholder={passwordPlaceholder}
            required
            type="password"
          />
          {isSignUp ? <small>{t.passwordHint}</small> : null}
        </label>

        {isSignUp ? (
          <label className={styles.field}>
            <span>{t.confirmPasswordLabel}</span>
            <input
              autoComplete="new-password"
              disabled={pending}
              maxLength={128}
              minLength={8}
              name="passwordConfirmation"
              placeholder={t.confirmPasswordPlaceholder}
              required
              type="password"
            />
          </label>
        ) : null}

        <p
          aria-live="polite"
          className={`${styles.message} ${error ? styles.messageVisible : ""}`}
          role={error ? "alert" : undefined}
        >
          {error || " "}
        </p>

        <button
          className={styles.submitButton}
          disabled={pending}
          type="submit"
        >
          {pending ? submitPendingLabel : submitLabel}
        </button>
      </form>

      <p className={styles.switchPrompt}>
        {switchPrompt} <Link href={alternateAuthHref}>{switchLink}</Link>
      </p>
    </div>
  );
}
