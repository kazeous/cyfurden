"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useSyncExternalStore } from "react";
import { localeCookieName, type Locale } from "@/lib/i18n/locales";
import styles from "./global-error.module.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const subscribeToLocale = () => () => undefined;

const readClientLocale = (): Locale => {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${localeCookieName}=`));
  return cookie?.slice(localeCookieName.length + 1) === "vi" ? "vi" : "en";
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    readClientLocale,
    () => "en",
  );

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const strings =
    locale === "vi"
      ? {
          eyebrow: "Cyfurden / gián đoạn tạm thời",
          title: "Đã xảy ra sự cố ngoài dự kiến.",
          body: "Hãy thử tải lại trang, hoặc quay lại sau giây lát nếu sự cố vẫn tiếp diễn.",
          retry: "Thử lại",
        }
      : {
          eyebrow: "Cyfurden / temporary interruption",
          title: "We hit an unexpected snag.",
          body: "Try the page again, or return in a moment if the problem continues.",
          retry: "Try again",
        };

  return (
    <html lang={locale}>
      <body className={styles.body}>
        <main className={styles.card}>
          <p className={styles.eyebrow}>{strings.eyebrow}</p>
          <h1>{strings.title}</h1>
          <p>{strings.body}</p>
          <button type="button" onClick={reset}>
            {strings.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
