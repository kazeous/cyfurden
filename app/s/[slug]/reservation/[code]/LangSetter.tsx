"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

export function LangSetter({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (typeof globalThis.document === "undefined") return;
    globalThis.document.documentElement.lang = locale;
    return () => {
      globalThis.document.documentElement.lang = "en";
    };
  }, [locale]);
  return null;
}