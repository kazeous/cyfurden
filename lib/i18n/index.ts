import type { Locale } from "./locales";
import { defaultLocale, parseLocale } from "./locales";
import type { Catalogue } from "./catalogue";
import { enCatalogue } from "./en";
import { viCatalogue } from "./vi";

export {
  defaultLocale,
  localeCookieName,
  localeDisplayCodes,
  localeDisplayNames,
  parseLocale,
  supportedLocales,
  isLocale,
  type Locale,
} from "./locales";

const catalogues: Record<Locale, Catalogue> = {
  en: enCatalogue,
  vi: viCatalogue,
};

export function getCatalogue(locale: Locale | string | undefined): Catalogue {
  return catalogues[parseLocale(locale)] ?? catalogues[defaultLocale];
}

export function translate<CatalogueSection extends keyof Catalogue>(
  locale: Locale | string | undefined,
  section: CatalogueSection,
): Catalogue[CatalogueSection] {
  return getCatalogue(locale)[section];
}

export type { Catalogue } from "./catalogue";
export type {
  PublicAuthStrings,
  PublicBoothStrings,
  PublicLandingStrings,
  PublicReservationStrings,
} from "./catalogue";