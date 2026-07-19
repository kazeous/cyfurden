"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import styles from "./auth.module.css";

type AuthMode = "sign-in" | "sign-up";

interface AuthFormProps {
  googleEnabled: boolean;
  mode: AuthMode;
  returnTo?: string;
}

function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
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

export function AuthForm({ googleEnabled, mode, returnTo }: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const destination = safeReturnTo(returnTo);

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
        setError("Those passwords do not match. Please try again.");
        return;
      }
    }

    setPending(true);

    try {
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
        setError(
          result.error.message ??
            (isSignUp
              ? "We could not create your account. Please check your details."
              : "We could not sign you in. Please check your details."),
        );
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError("Something went wrong. Please wait a moment and try again.");
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
        setError(
          result.error.message ??
            "Google sign-in could not be started. Please try again.",
        );
        setPending(false);
      }
    } catch {
      setError("Google sign-in could not be started. Please try again.");
      setPending(false);
    }
  };

  return (
    <div className={styles.formPanel}>
      <div className={styles.formHeading}>
        <p className={styles.eyebrow}>
          {isSignUp ? "Your creative workspace" : "Welcome back"}
        </p>
        <h1>{isSignUp ? "Make room for your work" : "Step into your booth"}</h1>
        <p>
          {isSignUp
            ? "Create an account to organize your booths, products, and convention orders."
            : "Sign in to choose a booth and pick up where you left off."}
        </p>
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
            Continue with Google
          </button>
          <div className={styles.divider} aria-hidden="true">
            <span>or use email</span>
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
            <span>Display name</span>
            <input
              autoComplete="name"
              disabled={pending}
              maxLength={80}
              minLength={2}
              name="name"
              placeholder="How should we greet you?"
              required
              type="text"
            />
          </label>
        ) : null}

        <label className={styles.field}>
          <span>Email address</span>
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
          <span>Password</span>
          <input
            autoComplete={isSignUp ? "new-password" : "current-password"}
            disabled={pending}
            maxLength={128}
            minLength={8}
            name="password"
            placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            required
            type="password"
          />
          {isSignUp ? <small>Use 8–128 characters.</small> : null}
        </label>

        {isSignUp ? (
          <label className={styles.field}>
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              disabled={pending}
              maxLength={128}
              minLength={8}
              name="passwordConfirmation"
              placeholder="Type it once more"
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
          {error || "\u00a0"}
        </p>

        <button
          className={styles.submitButton}
          disabled={pending}
          type="submit"
        >
          {pending
            ? isSignUp
              ? "Creating your account…"
              : "Signing you in…"
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className={styles.switchPrompt}>
        {isSignUp ? "Already have an account?" : "New to Cyfurden?"}{" "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"}>
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
