import type { Metadata } from "next";
import { BoothDangerZone } from "@/components/admin/booth-danger-zone";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { parseBilingual } from "@/lib/i18n";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { isOracleQrUploadConfigured } from "@/lib/oracle-uploads";
import { readBoothSocialLinks } from "@/lib/shop-settings";
import { defaultPaymentContent } from "@/lib/system-content";
import { SettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).settings;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

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
  const [payment, locale] = await Promise.all([
    db.boothPaymentInstruction.findUnique({ where: { boothId } }),
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.settings;

  return (
    <>
      <PageHeading
        eyebrow={strings.eyebrow}
        title={strings.title}
        description={strings.description}
        actions={
          <>
            <span className={styles.pill}>
              {workspaceStrings.common.roleLabels[membership.role] ??
                membership.role}
            </span>
            <span className={styles.pill}>/s/{booth.slug}</span>
          </>
        }
      />

      {messages.saved ? (
        <p className={styles.successNotice} role="status">
          {strings.savedNotice}
        </p>
      ) : null}

      <SettingsForm
        booth={booth}
        locale={locale}
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
          accountName:
            payment?.accountName ?? parseBilingual(booth.name, locale),
          accountNumber: payment?.accountNumber ?? "0000000000",
          paymentLabel: payment?.paymentLabel ?? defaultPaymentContent.label,
          transferReferenceTemplate:
            payment?.transferReferenceTemplate ?? "{code}",
          qrObjectKey: payment?.qrObjectKey ?? "",
          instructions:
            payment?.instructions ?? defaultPaymentContent.instructions,
          disclaimer: payment?.disclaimer ?? defaultPaymentContent.disclaimer,
        }}
        uploadConfigured={isOracleQrUploadConfigured()}
      />

      {membership.role === "OWNER" ? (
        <BoothDangerZone
          boothName={parseBilingual(booth.name, locale)}
          locale={locale}
        />
      ) : null}
    </>
  );
}
