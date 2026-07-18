import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
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
      default: "Cyfurden — Lantern & Loom Booth",
      template: "%s · Cyfurden",
    },
    description:
      "Original artist booths for small-batch art, convention pre-orders, and manual pickup.",
    applicationName: "Cyfurden",
    openGraph: {
      type: "website",
      title: "Cyfurden artist booths",
      description:
        "Discover independent artists, small-batch merchandise, and convention exclusives.",
      siteName: "Cyfurden",
      images: [
        {
          url: "/og.png",
          width: 1536,
          height: 1024,
          alt: "Cyfurden and Lantern & Loom illustrated artist booth",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Cyfurden artist booths",
      description: "A pocket-sized home for original artist booths.",
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4efe3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
