"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import styles from "./global-error.module.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className={styles.body}>
        <main className={styles.card}>
          <p className={styles.eyebrow}>Cyfurden / temporary interruption</p>
          <h1>We hit an unexpected snag.</h1>
          <p>
            Try the page again, or return in a moment if the problem continues.
          </p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
