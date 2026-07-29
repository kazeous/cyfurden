import { cookies } from "next/headers";
import { defaultLocale, localeCookieName, parseLocale } from "./locales";
import type { Locale } from "./locales";

/**
 * Read the visitor-facing locale from the persisted cookie. Falls back
 * to the default locale when the cookie is unset or invalid.
 */
export async function readLocaleCookie(): Promise<Locale> {
  try {
    const store = await cookies();
    const value = store.get(localeCookieName)?.value;
    return parseLocale(value);
  } catch {
    return defaultLocale;
  }
}
