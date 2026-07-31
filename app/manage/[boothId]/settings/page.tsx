import type { Metadata } from "next";
import { BoothDangerZone } from "@/components/admin/booth-danger-zone";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { isOracleQrUploadConfigured } from "@/lib/oracle-uploads";
import { readBoothSocialLinks } from "@/lib/shop-settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { boothId } = await params;
  const messages = await searchParams;
  const { booth, membership } = await requireBoothSection(boothId, "settings");
  const payment = await db.boothPaymentInstruction.findUnique({
    where: { boothId },
  });

  return (
    <>
      <PageHeading
        eyebrow="Workspace controls"
        title="Settings"
        description="Manage the booth identity and manual bank-transfer handoff without leaving this workspace."
        actions={
          <>
            <span className={styles.pill}>{membership.role.toLowerCase()}</span>
            <span className={styles.pill}>/s/{booth.slug}</span>
          </>
        }
      />

      {messages.saved ? (
        <p className={styles.successNotice} role="status">
          Settings saved. Publish the storefront draft if its public booth name
          should change for visitors.
        </p>
      ) : null}

      <SettingsForm
        booth={booth}
        identity={{
          logoObjectKey: booth.logoObjectKey ?? "",
          logoUrl: booth.logoObjectKey
            ? resolveOracleImageUrl({ objectKey: booth.logoObjectKey })
            : undefined,
          socialLinks: readBoothSocialLinks(booth.socialLinks),
        }}
        payment={{
          bankName: payment?.bankName ?? "",
          bankCode: payment?.bankCode ?? "",
          accountName: payment?.accountName ?? booth.name,
          accountNumber: payment?.accountNumber ?? "0000000000",
          paymentLabel: payment?.paymentLabel ?? "Bank transfer",
          transferReferenceTemplate:
            payment?.transferReferenceTemplate ?? "{code}",
          qrObjectKey: payment?.qrObjectKey ?? "",
          instructions:
            payment?.instructions ??
            "Transfer the exact order total and include the order reference.",
          disclaimer:
            payment?.disclaimer ??
            "Bank transfers are reviewed manually. Cyfurden does not verify or process payment automatically.",
        }}
        uploadConfigured={isOracleQrUploadConfigured()}
      />

      {membership.role === "OWNER" ? (
        <BoothDangerZone
          boothId={booth.id}
          boothName={booth.name}
          boothSlug={booth.slug}
        />
      ) : null}
    </>
  );
}
