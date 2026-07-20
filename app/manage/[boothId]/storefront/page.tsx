import { StorefrontDesigner } from "@/components/admin/storefront-designer";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { requireBoothRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import { isOracleQrUploadConfigured } from "@/lib/oracle-uploads";
import {
  readStorefrontDocument,
  storefrontCornerRadiusPixels,
  storefrontLocaleDisplayCodes,
} from "@/lib/storefront-document";

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ saved?: string; published?: string }>;
}) {
  const { boothId } = await params;
  const messages = await searchParams;
  const { booth } = await requireBoothRole(boothId, ["OWNER", "ADMIN"]);
  const [config, payment, productCount, featuredCount] = await Promise.all([
    db.storefrontConfig.findUnique({ where: { boothId } }),
    db.boothPaymentInstruction.findUnique({ where: { boothId } }),
    db.product.count({ where: { boothId, status: { not: "HIDDEN" } } }),
    db.product.count({
      where: { boothId, featured: true, status: { not: "HIDDEN" } },
    }),
  ]);
  const document = readStorefrontDocument(config?.draftDocument, booth.name);

  return (
    <>
      <PageHeading
        eyebrow="Visual storefront"
        title="Storefront designer"
        description="Build the storefront directly on the preview, then save and publish when it is ready."
        actions={
          <>
            <span
              className={styles.pill}
              aria-label={`Card corner radius: ${storefrontCornerRadiusPixels[document.cornerRadius]} pixels`}
            >
              {storefrontCornerRadiusPixels[document.cornerRadius]}px corners
            </span>
            <span
              className={styles.pill}
              aria-label={`Storefront language: ${document.locale === "en" ? "English" : "Vietnamese"}`}
            >
              {storefrontLocaleDisplayCodes[document.locale]} locale
            </span>
          </>
        }
      />

      {messages.saved ? (
        <p className={styles.notice}>
          Draft saved. The public storefront is unchanged until you publish.
        </p>
      ) : null}
      {messages.published ? (
        <p className={styles.notice}>
          Published successfully. Visitors now see this storefront revision.
        </p>
      ) : null}

      <StorefrontDesigner
        boothId={boothId}
        boothStatus={booth.status}
        document={document}
        payment={{
          bankName: payment?.bankName ?? "Demo Bank",
          accountName: payment?.accountName ?? document.creatorName,
          accountNumber: payment?.accountNumber ?? "0000000000",
          transferReferenceTemplate:
            payment?.transferReferenceTemplate ?? "CYF-{ORDER}",
          qrObjectKey: payment?.qrObjectKey ?? "",
          instructions:
            payment?.instructions ??
            "Transfer the exact order total and include the order reference.",
          disclaimer:
            payment?.disclaimer ??
            "Bank transfers are reviewed manually. Cyfurden does not verify or process payment automatically.",
        }}
        editVersion={config?.editVersion ?? 1}
        qrUploadConfigured={isOracleQrUploadConfigured()}
        productCount={productCount}
        featuredCount={featuredCount}
      />
    </>
  );
}
