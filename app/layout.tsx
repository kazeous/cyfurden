import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import { translate } from "@/lib/i18n";
import { readRequestLocale } from "@/lib/i18n/server-locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readRequestLocale();
  const landing = translate(locale, "publicLanding");
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0];
  const requestHost = (
    forwardedHost ??
    requestHeaders.get("host") ??
    ""
  ).trim();
  const safeHost = /^[a-z\d.-]+(?::\d+)?$/i.test(requestHost)
    ? requestHost
    : "localhost:4173";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : safeHost.startsWith("localhost")
        ? "http"
        : "https";

  return {
    metadataBase: new URL(`${protocol}://${safeHost}`),
    title: {
      default: `Cyfurden — ${landing.heroTitle}`,
      template: "%s · Cyfurden",
    },
    description: landing.heroBody,
    applicationName: "Cyfurden",
    openGraph: {
      type: "website",
      title: `Cyfurden — ${landing.heroTitle}`,
      description: landing.heroBody,
      siteName: "Cyfurden",
    },
    twitter: {
      card: "summary",
      title: `Cyfurden — ${landing.heroTitle}`,
      description: landing.heroBody,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4efe3",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await readRequestLocale();

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
