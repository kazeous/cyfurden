"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Next.js preserves the root layout during client navigation. Keep the
 * document language synchronized when a page changes locale without a full
 * HTML reload; the root layout still provides the correct server-rendered
 * value for direct requests.
 */
export function DocumentLocale({ locale }: { locale: Locale }) {
  useEffect(() => {
    globalThis.document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
