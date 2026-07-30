export const supportedLocales = ["en", "vi"] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (supportedLocales as readonly string[]).includes(value)
  );
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export const localeCookieName = "cyfurden:locale";

export const localeDisplayCodes: Record<Locale, string> = {
  en: "EN",
  vi: "VN",
};

export const localeDisplayNames: Record<Locale, string> = {
  en: "English",
  vi: "Tiếng Việt",
};
