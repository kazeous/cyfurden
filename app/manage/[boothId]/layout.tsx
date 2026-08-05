import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import { getAdminShellStrings } from "@/lib/i18n/admin-shell";
import { readLocaleCookie } from "@/lib/i18n/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getAdminShellStrings(await readLocaleCookie()).metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function ManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const { booth, membership, session } = await requireBoothMember(boothId);
  const [memberships, productCount, locale] = await Promise.all([
    db.boothMembership.findMany({
      where: {
        userId: session.user.id,
        status: "ACTIVE",
      },
      select: {
        role: true,
        booth: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.count({ where: { boothId } }),
    readLocaleCookie(),
  ]);
  return (
    <AdminShell
      booth={booth}
      booths={memberships.map(({ booth: option, role }) => ({
        ...option,
        role,
      }))}
      locale={locale}
      productCount={productCount}
      role={membership.role}
    >
      {children}
    </AdminShell>
  );
}
