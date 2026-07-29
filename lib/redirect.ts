/**
 * Shared same-origin redirect guard.
 *
 * `safeReturnTo` defends against open-redirect phishing by only accepting
 * paths that are unambiguously same-origin. Anything that isn't a leading
 * `/` (so the URL is parsed as a path, not a scheme or authority) is
 * rejected; `//host/path` is rejected explicitly because some clients
 * resolve it as a host swap.
 *
 * Used by `setLocaleAction` (the language toggle) and the auth form's
 * `returnTo` flow.
 */
export function safeReturnTo(
  value: string | undefined | null,
  fallback = "/",
): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
}
