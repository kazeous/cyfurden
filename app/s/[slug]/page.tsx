import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { ManagedStorefront } from "@/components/storefront/managed-storefront";
import { db } from "@/lib/db";
import { readPublishedGachaDocument } from "@/lib/gacha-document";
import { parseBilingual } from "@/lib/i18n";
import {
  createOrderPaymentSnapshot,
  isPurchasableVariant,
} from "@/lib/order-rules";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { parseReservationCode, reservationPath } from "@/lib/reservation-code";
import { readBoothSocialLinks, socialPlatforms } from "@/lib/shop-settings";
import {
  readStorefrontDocument,
  resolveStorefrontFeaturedProductIds,
} from "@/lib/storefront-document";

const getManagedBooth = cache(async (slug: string) => {
  try {
    return await db.booth.findUnique({
      where: { slug },
      include: {
        storefront: true,
        gacha: true,
        paymentInstructions: true,
        promotions: {
          where: { active: true },
          include: { products: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        products: {
          where: { status: { in: ["LIVE", "SOLD_OUT"] } },
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            variants: { orderBy: { sortOrder: "asc" } },
            category: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { "cyfurden.operation": "public_storefront.load" },
    });
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const managed = await getManagedBooth(slug);
  if (
    !managed ||
    managed.status !== "PUBLISHED" ||
    !managed.storefront?.publishedDocument
  ) {
    return {
      title: "Booth not found",
      robots: { index: false, follow: false },
    };
  }
  const document = readStorefrontDocument(
    managed.storefront.publishedDocument,
    managed.name,
  );
  const title = parseBilingual(document.name, document.locale);
  const description = parseBilingual(document.tagline, document.locale);
  const introduction = parseBilingual(document.introduction, document.locale);
  return {
    title,
    description,
    openGraph: {
      title,
      description: introduction,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function PublicBoothPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { slug } = await params;
  const { order } = await searchParams;
  const managed = await getManagedBooth(slug);
  if (
    !managed ||
    managed.status !== "PUBLISHED" ||
    !managed.storefront?.publishedDocument
  ) {
    notFound();
  }
  const legacyOrderCode = parseReservationCode(order);
  if (legacyOrderCode) {
    const legacyOrder = await db.order.findUnique({
      where: {
        boothId_code: {
          boothId: managed.id,
          code: legacyOrderCode,
        },
      },
      select: { code: true },
    });
    if (legacyOrder) {
      redirect(reservationPath(slug, legacyOrder.code));
    }
  }
  const document = readStorefrontDocument(
    managed.storefront.publishedDocument,
    managed.name,
  );
  const featuredProductIds = resolveStorefrontFeaturedProductIds(
    document,
    managed.products,
  );
  const featuredProductIdSet = new Set(featuredProductIds);
  const products = managed.products.map((product) => ({
    id: product.id,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    name: product.name,
    eyebrow: product.eyebrow,
    shortDescription: product.shortDescription,
    description: product.description,
    priceCents: product.priceCents.toString(),
    sku: product.sku,
    featured: featuredProductIdSet.has(product.id),
    tags: product.tags,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    images: product.images.map((image) => ({
      objectKey: image.objectKey,
      alt: image.alt,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      priceCents:
        variant.priceCents === null ? null : variant.priceCents.toString(),
      status: variant.status,
      stockQuantity: variant.stockQuantity,
      fulfillmentNote: variant.fulfillmentNote,
    })),
  }));
  const purchasableProductIds = new Set(
    managed.products.flatMap((product) =>
      product.status === "LIVE" &&
      product.variants.some((variant) =>
        isPurchasableVariant(variant.status, variant.stockQuantity),
      )
        ? [product.id]
        : [],
    ),
  );
  const promotions = managed.promotions.flatMap((promotion) => {
    const buyProductIds = promotion.products.flatMap((product) =>
      product.role === "BUY" && purchasableProductIds.has(product.productId)
        ? [product.productId]
        : [],
    );
    const rewardProductIds = promotion.products.flatMap((product) =>
      product.role === "REWARD" && purchasableProductIds.has(product.productId)
        ? [product.productId]
        : [],
    );
    return buyProductIds.length && rewardProductIds.length
      ? [
          {
            id: promotion.id,
            name: parseBilingual(promotion.name, document.locale),
            buyQuantity: promotion.buyQuantity,
            rewardQuantity: promotion.rewardQuantity,
            repeatable: promotion.repeatable,
            buyProductIds,
            rewardProductIds,
          },
        ]
      : [];
  });
  const socialLinks = readBoothSocialLinks(managed.socialLinks);
  const gacha = readPublishedGachaDocument(managed.gacha?.publishedDocument);
  return (
    <ManagedStorefront
      booth={{ id: managed.id, slug: managed.slug }}
      identity={{
        logoUrl: managed.logoObjectKey
          ? resolveOracleImageUrl({ objectKey: managed.logoObjectKey })
          : undefined,
        socialLinks: socialPlatforms.flatMap(({ id, label }) =>
          socialLinks[id] ? [{ id, label, url: socialLinks[id] }] : [],
        ),
      }}
      document={document}
      products={products}
      promotions={promotions}
      gacha={gacha}
      canAcceptReservations={Boolean(
        createOrderPaymentSnapshot(managed.paymentInstructions),
      )}
      locale={document.locale}
    />
  );
}
