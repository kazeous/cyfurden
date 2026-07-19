import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { booth } from "../lib/booth-data";
import { createDefaultStorefrontDocument } from "../lib/storefront-document";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://cyfurden:cyfurden@127.0.0.1:55433/cyfurden";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const statusForVariant = (status: string) => {
  if (status === "available") return "AVAILABLE" as const;
  if (status === "low-stock") return "LOW_STOCK" as const;
  if (status === "preorder") return "PREORDER" as const;
  return "SOLD_OUT" as const;
};

const variantPrice = (variant: unknown, fallback: number) => {
  if (
    typeof variant === "object" &&
    variant !== null &&
    "priceCents" in variant &&
    typeof variant.priceCents === "number"
  ) {
    return variant.priceCents;
  }
  return fallback;
};

async function main() {
  const demoOwner = await prisma.user.upsert({
    where: { email: "demo-owner@cyfurden.local" },
    update: { name: "Cyfurden demo owner" },
    create: {
      id: "demo-owner",
      name: "Cyfurden demo owner",
      email: "demo-owner@cyfurden.local",
      emailVerified: true,
    },
  });

  const savedBooth = await prisma.booth.upsert({
    where: { slug: booth.slug },
    update: {
      name: booth.name,
      ownerId: demoOwner.id,
      status: "PUBLISHED",
    },
    create: {
      slug: booth.slug,
      name: booth.name,
      ownerId: demoOwner.id,
      status: "PUBLISHED",
      locale: "en",
      currency: "VND",
    },
  });

  await prisma.boothMembership.upsert({
    where: { boothId_userId: { boothId: savedBooth.id, userId: demoOwner.id } },
    update: { role: "OWNER", status: "ACTIVE" },
    create: {
      boothId: savedBooth.id,
      userId: demoOwner.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  const document = createDefaultStorefrontDocument(booth.name);
  await prisma.storefrontConfig.upsert({
    where: { boothId: savedBooth.id },
    update: {
      draftDocument: {
        ...document,
        name: booth.name,
        tagline: booth.tagline,
        introduction: booth.introduction,
        announcement: booth.announcement,
        creatorName: booth.creator.name,
        creatorPronouns: booth.creator.pronouns,
        creatorLocation: booth.creator.location,
        creatorBio: booth.creator.bio,
        eventName: booth.event.name,
        eventVenue: booth.event.venue,
        eventBoothLabel: booth.event.boothLabel,
        eventHours: booth.event.displayHours,
        eventStatusLabel: booth.event.statusLabel,
        eventFulfillment: booth.event.fulfillment,
      },
      publishedDocument: {
        ...document,
        name: booth.name,
        tagline: booth.tagline,
        introduction: booth.introduction,
        announcement: booth.announcement,
        creatorName: booth.creator.name,
        creatorPronouns: booth.creator.pronouns,
        creatorLocation: booth.creator.location,
        creatorBio: booth.creator.bio,
        eventName: booth.event.name,
        eventVenue: booth.event.venue,
        eventBoothLabel: booth.event.boothLabel,
        eventHours: booth.event.displayHours,
        eventStatusLabel: booth.event.statusLabel,
        eventFulfillment: booth.event.fulfillment,
      },
      publishedAt: new Date(),
    },
    create: {
      boothId: savedBooth.id,
      draftDocument: {
        ...document,
        name: booth.name,
        tagline: booth.tagline,
        introduction: booth.introduction,
        announcement: booth.announcement,
        creatorName: booth.creator.name,
        creatorPronouns: booth.creator.pronouns,
        creatorLocation: booth.creator.location,
        creatorBio: booth.creator.bio,
        eventName: booth.event.name,
        eventVenue: booth.event.venue,
        eventBoothLabel: booth.event.boothLabel,
        eventHours: booth.event.displayHours,
        eventStatusLabel: booth.event.statusLabel,
        eventFulfillment: booth.event.fulfillment,
      },
      publishedDocument: {
        ...document,
        name: booth.name,
        tagline: booth.tagline,
        introduction: booth.introduction,
        announcement: booth.announcement,
        creatorName: booth.creator.name,
        creatorPronouns: booth.creator.pronouns,
        creatorLocation: booth.creator.location,
        creatorBio: booth.creator.bio,
        eventName: booth.event.name,
        eventVenue: booth.event.venue,
        eventBoothLabel: booth.event.boothLabel,
        eventHours: booth.event.displayHours,
        eventStatusLabel: booth.event.statusLabel,
        eventFulfillment: booth.event.fulfillment,
      },
      publishedAt: new Date(),
    },
  });

  await prisma.boothPaymentInstruction.upsert({
    where: { boothId: savedBooth.id },
    update: {
      bankName: booth.payment.bankName,
      accountName: booth.payment.accountName,
      accountNumber: booth.payment.accountNumber,
      qrObjectKey: booth.payment.qrImage.objectKey,
      transferReferenceTemplate: booth.payment.transferReferenceTemplate,
      instructions: booth.payment.instructions,
      disclaimer: booth.payment.disclaimer,
    },
    create: {
      boothId: savedBooth.id,
      bankName: booth.payment.bankName,
      accountName: booth.payment.accountName,
      accountNumber: booth.payment.accountNumber,
      qrObjectKey: booth.payment.qrImage.objectKey,
      transferReferenceTemplate: booth.payment.transferReferenceTemplate,
      instructions: booth.payment.instructions,
      disclaimer: booth.payment.disclaimer,
    },
  });

  const categoryIds = new Map<string, string>();
  for (const [index, category] of booth.categories.entries()) {
    const savedCategory = await prisma.category.upsert({
      where: { boothId_slug: { boothId: savedBooth.id, slug: category.id } },
      update: {
        name: category.label,
        description: category.description,
        sortOrder: index,
      },
      create: {
        boothId: savedBooth.id,
        slug: category.id,
        name: category.label,
        description: category.description,
        sortOrder: index,
      },
    });
    categoryIds.set(category.id, savedCategory.id);
  }

  for (const [index, product] of booth.products.entries()) {
    const productStatus = product.variants.some(
      (variant) => variant.availability.purchasable,
    )
      ? "LIVE"
      : "SOLD_OUT";
    const savedProduct = await prisma.product.upsert({
      where: { boothId_slug: { boothId: savedBooth.id, slug: product.slug } },
      update: {
        categoryId: categoryIds.get(product.categoryId),
        sku: product.variants[0]?.sku,
        name: product.name,
        eyebrow: product.eyebrow,
        shortDescription: product.shortDescription,
        description: product.description,
        priceCents: BigInt(product.priceCents),
        status: productStatus,
        featured: product.featured,
        tags: [...product.tags],
        optionGroups: JSON.parse(JSON.stringify(product.optionGroups)),
        sortOrder: index,
      },
      create: {
        boothId: savedBooth.id,
        categoryId: categoryIds.get(product.categoryId),
        sku: product.variants[0]?.sku,
        slug: product.slug,
        name: product.name,
        eyebrow: product.eyebrow,
        shortDescription: product.shortDescription,
        description: product.description,
        priceCents: BigInt(product.priceCents),
        status: productStatus,
        featured: product.featured,
        tags: [...product.tags],
        optionGroups: JSON.parse(JSON.stringify(product.optionGroups)),
        sortOrder: index,
      },
    });

    for (const [variantIndex, variant] of product.variants.entries()) {
      await prisma.productVariant.upsert({
        where: {
          productId_sku: { productId: savedProduct.id, sku: variant.sku },
        },
        update: {
          label: variant.label,
          priceCents: BigInt(variantPrice(variant, product.priceCents)),
          status: statusForVariant(variant.availability.status),
          stockQuantity: variant.availability.quantityRemaining ?? null,
          fulfillmentNote: variant.availability.fulfillmentNote,
          optionValues: JSON.parse(JSON.stringify(variant.selectedOptions)),
          sortOrder: variantIndex,
        },
        create: {
          productId: savedProduct.id,
          sku: variant.sku,
          label: variant.label,
          priceCents: BigInt(variantPrice(variant, product.priceCents)),
          status: statusForVariant(variant.availability.status),
          stockQuantity: variant.availability.quantityRemaining ?? null,
          fulfillmentNote: variant.availability.fulfillmentNote,
          optionValues: JSON.parse(JSON.stringify(variant.selectedOptions)),
          sortOrder: variantIndex,
        },
      });
    }

    for (const [imageIndex, image] of product.images.entries()) {
      await prisma.productImage.upsert({
        where: {
          productId_objectKey: {
            productId: savedProduct.id,
            objectKey: image.objectKey,
          },
        },
        update: {
          alt: image.alt,
          width: image.width,
          height: image.height,
          sortOrder: imageIndex,
        },
        create: {
          productId: savedProduct.id,
          objectKey: image.objectKey,
          alt: image.alt,
          width: image.width,
          height: image.height,
          sortOrder: imageIndex,
        },
      });
    }
  }

  await prisma.quantityPromotion.upsert({
    where: { id: "seed-quantity-promotion" },
    update: {},
    create: {
      id: "seed-quantity-promotion",
      boothId: savedBooth.id,
      name: "Buy 3, get 1 free",
      buyQuantity: 3,
      rewardQuantity: 1,
      active: false,
      repeatable: true,
    },
  });

  await prisma.gachaConfig.upsert({
    where: { boothId: savedBooth.id },
    update: {},
    create: {
      boothId: savedBooth.id,
      enabled: false,
      title: "Wish upon the shelf",
      introduction:
        "Meet a surprise character or discover a featured object from this booth.",
      gameTheme: "anemo",
      pityEnabled: true,
      guaranteedAt: 50,
      rates: { common: 70, rare: 24, epic: 5, legendary: 1 },
    },
  });

  await prisma.gachaBanner.upsert({
    where: { id: "seed-merch-event-wish" },
    update: {},
    create: {
      id: "seed-merch-event-wish",
      boothId: savedBooth.id,
      title: "Merch Event Wish",
      copy: "Featured finds from this shelf.",
      type: "CHARACTER",
      theme: "anemo",
      featuredCount: 3,
      active: false,
      sortOrder: 0,
    },
  });

  console.log(
    `Seeded ${savedBooth.slug} with ${booth.products.length} products.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
