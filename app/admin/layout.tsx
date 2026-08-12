import type { Metadata } from "next";
import { PlatformAdminShell } from "@/components/platform-admin/platform-admin-shell";
import { getPlatformAdminStrings } from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { requirePlatformPermission } from "@/lib/platform-authorization";
import { readPlatformShell } from "@/lib/platform-inventory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie()).shell;
  return {
    title: strings.metadataTitle,
    description: strings.metadataDescription,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const context = await readPlatformShell(access);
  return (
    <PlatformAdminShell locale={locale} role={context.role} user={context.user}>
      {children}
    </PlatformAdminShell>
  );
}
