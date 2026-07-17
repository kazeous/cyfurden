import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4173",
);

export const metadata: Metadata = {
  metadataBase: siteUrl,
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
