import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";
import { notFound, redirect } from "next/navigation";
import { ManagedStorefront } from "@/components/storefront/managed-storefront";
import { db } from "@/lib/db";
import { createOrderPaymentSnapshot } from "@/lib/order-rules";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { readBoothSocialLinks, socialPlatforms } from "@/lib/shop-settings";
import { readStorefrontDocument } from "@/lib/storefront-document";

async function getManagedBooth(slug: string) {
  try {
    return await db.booth.findUnique({
      where: { slug },
      include: {
        storefront: true,
        paymentInstructions: true,
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
    if (process.env.CYFURDEN_RENDER_TEST === "1") return null;
    throw error;
  }
}

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
  return {
    title: document.name,
    description: document.tagline,
    openGraph: {
      title: document.name,
      description: document.introduction,
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
  if (order) {
    redirect(
      `/s/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(order)}`,
    );
  }
  const document = readStorefrontDocument(
    managed.storefront.publishedDocument,
    managed.name,
  );
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
    featured: product.featured,
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
  const socialLinks = readBoothSocialLinks(managed.socialLinks);
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
      canAcceptReservations={Boolean(
        createOrderPaymentSnapshot(managed.paymentInstructions),
      )}
    />
  );
}
