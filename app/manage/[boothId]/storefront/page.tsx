import { StorefrontDesigner } from "@/components/admin/storefront-designer";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { isOracleQrUploadConfigured } from "@/lib/oracle-uploads";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { readBoothSocialLinks } from "@/lib/shop-settings";
import {
  readStorefrontDocument,
  storefrontCornerRadiusPixels,
  storefrontLocaleDisplayCodes,
} from "@/lib/storefront-document";
import { defaultPaymentContent } from "@/lib/system-content";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).storefront;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ saved?: string; published?: string }>;
}) {
  const { boothId } = await params;
  const messages = await searchParams;
  const { booth } = await requireBoothSection(boothId, "storefront");
  const [config, payment, storefrontProducts, locale] = await Promise.all([
    db.storefrontConfig.findUnique({ where: { boothId } }),
    db.boothPaymentInstruction.findUnique({ where: { boothId } }),
    db.product.findMany({
      where: { boothId, status: { in: ["LIVE", "SOLD_OUT"] } },
      select: {
        id: true,
        name: true,
        eyebrow: true,
        priceCents: true,
        featured: true,
        status: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        images: {
          select: { objectKey: true, alt: true },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    readLocaleCookie(),
  ]);
  const document = readStorefrontDocument(config?.draftDocument, booth.name);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.storefront;

  return (
    <>
      <PageHeading
        eyebrow={strings.eyebrow}
        title={strings.title}
        description={strings.description}
        actions={
          <>
            <span
              className={styles.pill}
              aria-label={strings.cornerAria(
                storefrontCornerRadiusPixels[document.cornerRadius],
              )}
            >
              {strings.cornerLabel(
                storefrontCornerRadiusPixels[document.cornerRadius],
              )}
            </span>
            <span
              className={styles.pill}
              aria-label={strings.localeAria(
                workspaceStrings.common.localeName[document.locale],
              )}
            >
              {strings.localeLabel(
                storefrontLocaleDisplayCodes[document.locale],
              )}
            </span>
          </>
        }
      />

      {messages.saved ? (
        <p className={styles.notice}>{strings.savedNotice}</p>
      ) : null}
      {messages.published ? (
        <p className={styles.notice}>{strings.publishedNotice}</p>
      ) : null}

      <StorefrontDesigner
        boothId={boothId}
        workspaceLocale={locale}
        boothStatus={booth.status}
        document={document}
        payment={{
          bankName: payment?.bankName ?? "",
          bankCode: payment?.bankCode ?? "",
          accountName: payment?.accountName ?? document.creatorName,
          accountNumber: payment?.accountNumber ?? "0000000000",
          paymentLabel: payment?.paymentLabel ?? defaultPaymentContent.label,
          transferReferenceTemplate:
            payment?.transferReferenceTemplate ?? "{code}",
          qrObjectKey: payment?.qrObjectKey ?? "",
          instructions:
            payment?.instructions ?? defaultPaymentContent.instructions,
          disclaimer: payment?.disclaimer ?? defaultPaymentContent.disclaimer,
        }}
        identity={{
          logoObjectKey: booth.logoObjectKey ?? "",
          logoUrl: booth.logoObjectKey
            ? resolveOracleImageUrl({ objectKey: booth.logoObjectKey })
            : undefined,
          socialLinks: readBoothSocialLinks(booth.socialLinks),
        }}
        editVersion={config?.editVersion ?? 1}
        qrUploadConfigured={isOracleQrUploadConfigured()}
        products={storefrontProducts.map((product) => ({
          id: product.id,
          name: product.name,
          eyebrow: product.eyebrow,
          priceCents: product.priceCents.toString(),
          featured: product.featured,
          status: product.status,
          category: product.category,
          image: product.images[0] ?? null,
        }))}
      />
    </>
  );
}
import type { Metadata } from "next";
