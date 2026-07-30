import type { Locale } from "./locales";
import { defaultLocale, parseLocale } from "./locales";

const TAG_PATTERN = /\[(en|vi)\]([\s\S]*?)\[\/\1\]/gi;

/**
 * Extract bilingual content from a seller-authored string.
 *
 * Accepts the inline form `[en]English[/en][vi]Vietnamese[/vi]` and returns
 * the value for the requested locale. Plain text (no tags) returns the
 * same value for every locale so legacy content keeps rendering unchanged.
 *
 * Gracefully degrades:
 * - When the requested locale tag is missing, the first complete
 *   translation serves both languages.
 * - When the closing tag is missing, any unclosed `[en]` / `[vi]` tag is
 *   stripped so the remainder reads as plain text.
 * - When the tags appear nested, only the first complete pair wins.
 */
export function parseBilingual(
  value: string | null | undefined,
  locale: Locale | string | undefined,
): string {
  const safe = (value ?? "").trim();
  if (!safe) return "";
  const target = parseLocale(locale);
  if (!safe.includes("[")) return safe;

  const partialStripped = safe.replace(/\[(en|vi)\]/gi, "");

  const partialHasCloser = /\[(en|vi)\][\s\S]*?\[\/\1\]/i.test(safe);
  if (!partialHasCloser) return partialStripped.trim();

  const localized: Partial<Record<Locale, string>> = {};
  let firstMatch = "";
  for (const match of safe.matchAll(TAG_PATTERN)) {
    const [, tag, content] = match;
    if (!tag || content === undefined) continue;
    const key = tag.toLowerCase();
    if (key !== "en" && key !== "vi") continue;
    const text = content.trim();
    if (!firstMatch && text) firstMatch = text;
    localized[key] = text;
  }
  if (!Object.keys(localized).length) return partialStripped.trim();
  return localized[target] || localized[defaultLocale] || firstMatch || safe;
}
