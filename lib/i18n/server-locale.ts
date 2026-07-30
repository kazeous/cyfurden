import { cache } from "react";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { defaultLocale, localeCookieName, parseLocale } from "./locales";
import type { Locale } from "./locales";
import { localeRouteForPath, requestPathHeader } from "./request-path";

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

/**
 * Resolve the language for the current HTML document before it is rendered.
 * Landing/auth pages follow the visitor cookie, public booth routes follow the
 * published storefront document, and the currently English-only workspace is
 * explicitly marked as English.
 */
export const readRequestLocale = cache(async (): Promise<Locale> => {
  const requestHeaders = await headers();
  const route = localeRouteForPath(requestHeaders.get(requestPathHeader));

  if (route.scope === "site") return readLocaleCookie();
  if (route.scope === "admin") return defaultLocale;

  try {
    const booth = await db.booth.findUnique({
      where: { slug: route.slug },
      select: {
        name: true,
        status: true,
        storefront: {
          select: { publishedDocument: true },
        },
      },
    });
    if (booth?.status === "PUBLISHED" && booth.storefront?.publishedDocument) {
      return readStorefrontDocument(
        booth.storefront.publishedDocument,
        booth.name,
      ).locale;
    }
  } catch {
    // The route itself owns database error reporting and its final response.
  }

  return defaultLocale;
});
