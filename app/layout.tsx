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
      "A tiny convention booth for small-batch art, pocket companions, and manual pre-order pickup.",
    applicationName: "Cyfurden",
    openGraph: {
      type: "website",
      title: "Lantern & Loom on Cyfurden",
      description:
        "Browse paper treasures, wearable keepsakes, and convention exclusives from Lantern & Loom.",
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
      title: "Lantern & Loom on Cyfurden",
      description: "A pocket-sized artist booth for slow evenings.",
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
