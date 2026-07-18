import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireBoothMember } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Booth management",
  robots: { index: false, follow: false },
};

export default async function ManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const { booth, membership } = await requireBoothMember(boothId);
  return (
    <AdminShell booth={booth} role={membership.role}>
      {children}
    </AdminShell>
  );
}
