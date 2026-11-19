import { BOOTH_TIME_ZONE } from "../booth-time";
import { parseLocale } from "./locales";
import type { Locale } from "./locales";

const LOCALE_BAG: Record<Locale, string> = {
  en: "en-GB",
  vi: "vi-VN",
};

export function intlLocale(locale: Locale | string | undefined): string {
  return LOCALE_BAG[parseLocale(locale)] ?? LOCALE_BAG.en;
}

export function formatMoney(
  minorUnits: bigint | string | number,
  currency: string,
  locale: Locale | string | undefined = "en",
): string {
  const value =
    typeof minorUnits === "bigint"
      ? minorUnits
      : BigInt(
          typeof minorUnits === "string" ? minorUnits : String(minorUnits),
        );
  const tag = intlLocale(locale);
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) / 100);
}

export type BoothDateTimeFormatOptions = Omit<
  Intl.DateTimeFormatOptions,
  "timeZone"
>;

/**
 * The only supported way to build a date formatter. It always renders booth
 * time, so server output, browser hydration, and every host agree.
 */
export function createBoothDateTimeFormat(
  locale: Locale | string | undefined,
  options: BoothDateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...options,
    timeZone: BOOTH_TIME_ZONE,
  });
}

export function formatDateTime(
  date: Date,
  locale: Locale | string | undefined = "en",
): string {
  return createBoothDateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(
  date: Date,
  locale: Locale | string | undefined = "en",
): string {
  return createBoothDateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
