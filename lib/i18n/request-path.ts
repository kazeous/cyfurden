export const requestPathHeader = "x-cyfurden-request-path";

export type LocaleRoute =
  | { scope: "site" }
  | { scope: "booth"; slug: string }
  | { scope: "admin" };

export function localeRouteForPath(pathname: string | null): LocaleRoute {
  if (pathname === "/" || pathname === "/sign-in" || pathname === "/sign-up") {
    return { scope: "site" };
  }

  const boothMatch = pathname?.match(/^\/s\/([^/]+)(?:\/|$)/);
  if (boothMatch?.[1]) {
    try {
      return { scope: "booth", slug: decodeURIComponent(boothMatch[1]) };
    } catch {
      return { scope: "admin" };
    }
  }

  return { scope: "admin" };
}
