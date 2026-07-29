"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  localeCookieName,
  parseLocale,
  type Locale,
} from "@/lib/i18n";

export async function setLocaleAction(formData: FormData) {
  const requested = formData.get("locale");
  const locale = parseLocale(requested);
  const redirectTo = (formData.get("redirectTo") as string) || "/";

  try {
    const store = await cookies();
    store.set({
      name: localeCookieName,
      value: locale,
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      path: "/",
    });
  } catch {
    // cookies() may be unavailable during build; ignore.
  }

  redirect(redirectTo);
}

export type LocaleToggleInput = { locale: Locale; redirectTo?: string };