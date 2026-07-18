import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManagedStorefront } from "@/components/storefront/managed-storefront";
import { db } from "@/lib/db";
import { booth as staticBooth } from "@/lib/booth-data";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { BoothClient } from "@/app/booth-client";

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
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const managed = await getManagedBooth(slug);
  const document = managed
    ? readStorefrontDocument(
        managed.storefront?.publishedDocument,
        managed.name,
      )
    : null;
  return {
    title: document?.name ?? staticBooth.name,
    description: document?.tagline ?? staticBooth.tagline,
    openGraph: {
      title: document?.name ?? staticBooth.name,
      description: document?.introduction ?? staticBooth.introduction,
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
  if (!managed) {
    if (slug === staticBooth.slug) return <BoothClient />;
    notFound();
  }
  if (
    managed.status !== "PUBLISHED" ||
    !managed.storefront?.publishedDocument
  ) {
    if (slug === staticBooth.slug) return <BoothClient />;
    notFound();
  }
  const document = readStorefrontDocument(
    managed.storefront.publishedDocument,
    managed.name,
  );
  return (
    <ManagedStorefront
      booth={{ id: managed.id, slug: managed.slug }}
      document={document}
      products={managed.products}
      payment={managed.paymentInstructions}
      orderCode={order}
    />
  );
}
