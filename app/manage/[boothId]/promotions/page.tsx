import type { Metadata } from "next";
import { PageHeading } from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { defaultPromotionName } from "@/lib/system-content";
import { PromotionEditor } from "../products/promotion-editor";
import styles from "../products/products.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).promotion;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PromotionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { boothId } = await params;
  const filters = await searchParams;
  const [, locale] = await Promise.all([
    requireBoothSection(boothId, "promotions"),
    readLocaleCookie(),
  ]);
  const strings = getWorkspaceStrings(locale).promotion;
  const [promotion, products] = await Promise.all([
    db.quantityPromotion.findFirst({
      where: { boothId },
      include: { products: true },
      orderBy: { createdAt: "asc" },
    }),
    db.product.findMany({
      where: { boothId },
      select: { id: true, name: true, sku: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className={styles.page}>
      <PageHeading
        eyebrow={strings.pageEyebrow}
        title={strings.pageTitle}
        description={strings.pageDescription}
      />
      {filters.saved ? (
        <p className={styles.notice} role="status">
          {strings.savedNotice}
        </p>
      ) : null}
      <PromotionEditor
        boothId={boothId}
        locale={locale}
        products={products}
        promotion={{
          id: promotion?.id ?? null,
          name: promotion?.name ?? defaultPromotionName,
          buyQuantity: promotion?.buyQuantity ?? 3,
          rewardQuantity: promotion?.rewardQuantity ?? 1,
          active: promotion?.active ?? false,
          repeatable: promotion?.repeatable ?? true,
          buyProductIds:
            promotion?.products.flatMap((product) =>
              product.role === "BUY" ? [product.productId] : [],
            ) ?? [],
          rewardProductIds:
            promotion?.products.flatMap((product) =>
              product.role === "REWARD" ? [product.productId] : [],
            ) ?? [],
        }}
      />
    </div>
  );
}
