"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBoothRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  discardUploadedPaymentQr,
  OracleQrUploadError,
  uploadPaymentQr,
} from "@/lib/oracle-uploads";
import {
  storefrontDocumentSchema,
  storefrontSectionIds,
} from "@/lib/storefront-document";

const editorRoles = ["OWNER", "ADMIN"] as const;
const orderRoles = ["OWNER", "ADMIN", "STAFF"] as const;
const MAX_PRODUCT_PRICE_VND = 9_000_000_000_000;

const requiredText = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "").trim();

const optionalText = (formData: FormData, key: string) => {
  const value = requiredText(formData, key);
  return value || null;
};

const parseInteger = (value: FormDataEntryValue | null, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanField = (formData: FormData, key: string) =>
  formData.get(key) === "on" || formData.get(key) === "true";

const slugify = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

export type StorefrontSaveState = { error: string | null };

export async function saveStorefrontAction(
  _previousState: StorefrontSaveState,
  formData: FormData,
): Promise<StorefrontSaveState> {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const visibleSections = storefrontSectionIds.filter((section) =>
    booleanField(formData, `visible-${section}`),
  );
  let sectionOrder: unknown = storefrontSectionIds;
  try {
    sectionOrder = JSON.parse(requiredText(formData, "sectionOrder"));
  } catch {
    sectionOrder = storefrontSectionIds;
  }
  const document = storefrontDocumentSchema.parse({
    name: requiredText(formData, "name"),
    tagline: requiredText(formData, "tagline"),
    introduction: requiredText(formData, "introduction"),
    announcement: requiredText(formData, "announcement"),
    creatorName: requiredText(formData, "creatorName"),
    creatorPronouns: requiredText(formData, "creatorPronouns"),
    creatorLocation: requiredText(formData, "creatorLocation"),
    creatorBio: requiredText(formData, "creatorBio"),
    eventName: requiredText(formData, "eventName"),
    eventVenue: requiredText(formData, "eventVenue"),
    eventBoothLabel: requiredText(formData, "eventBoothLabel"),
    eventHours: requiredText(formData, "eventHours"),
    eventStatusLabel: requiredText(formData, "eventStatusLabel"),
    eventFulfillment: requiredText(formData, "eventFulfillment"),
    locale: requiredText(formData, "locale"),
    themePreset: requiredText(formData, "themePreset"),
    accentColor: requiredText(formData, "accentColor"),
    cornerRadius: requiredText(formData, "cornerRadius"),
    sectionOrder,
    visibleSections,
  });

  const existingPayment = await db.boothPaymentInstruction.findUnique({
    where: { boothId },
    select: { qrObjectKey: true },
  });
  const qrImage = formData.get("qrImage");
  let qrObjectKey = booleanField(formData, "removeQr")
    ? null
    : (existingPayment?.qrObjectKey ?? null);
  let uploadedQrObjectKey: string | null = null;

  if (qrImage instanceof File && qrImage.size > 0) {
    try {
      uploadedQrObjectKey = await uploadPaymentQr({ boothId, file: qrImage });
      qrObjectKey = uploadedQrObjectKey;
    } catch (error) {
      if (error instanceof OracleQrUploadError) {
        return { error: error.message };
      }
      throw error;
    }
  }

  try {
    await db.$transaction(async (transaction) => {
      await transaction.storefrontConfig.upsert({
        where: { boothId },
        create: {
          boothId,
          draftDocument: document,
          updatedById: session.user.id,
        },
        update: {
          draftDocument: document,
          editVersion: { increment: 1 },
          updatedById: session.user.id,
        },
      });
      await transaction.boothPaymentInstruction.upsert({
        where: { boothId },
        create: {
          boothId,
          bankName: requiredText(formData, "bankName"),
          accountName: requiredText(formData, "accountName"),
          accountNumber: requiredText(formData, "accountNumber"),
          qrObjectKey,
          transferReferenceTemplate:
            requiredText(formData, "transferReferenceTemplate") ||
            "CYF-{ORDER}",
          instructions: requiredText(formData, "paymentInstructions"),
          disclaimer:
            requiredText(formData, "paymentDisclaimer") ||
            "Bank transfers are reviewed manually. This storefront does not verify payment automatically.",
        },
        update: {
          bankName: requiredText(formData, "bankName"),
          accountName: requiredText(formData, "accountName"),
          accountNumber: requiredText(formData, "accountNumber"),
          qrObjectKey,
          transferReferenceTemplate:
            requiredText(formData, "transferReferenceTemplate") ||
            "CYF-{ORDER}",
          instructions: requiredText(formData, "paymentInstructions"),
          disclaimer:
            requiredText(formData, "paymentDisclaimer") ||
            "Bank transfers are reviewed manually. This storefront does not verify payment automatically.",
        },
      });
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: "storefront.draft_saved",
          entityType: "StorefrontConfig",
          entityId: boothId,
          metadata: {
            paymentQr: uploadedQrObjectKey
              ? "uploaded"
              : booleanField(formData, "removeQr")
                ? "removed"
                : "unchanged",
          },
        },
      });
    });
  } catch (error) {
    if (uploadedQrObjectKey) {
      await discardUploadedPaymentQr(uploadedQrObjectKey);
    }
    throw error;
  }

  revalidatePath(`/manage/${booth.id}/storefront`);
  redirect(`/manage/${booth.id}/storefront?saved=1`);
}

export async function publishStorefrontAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const config = await db.storefrontConfig.findUnique({ where: { boothId } });
  if (!config) {
    throw new Error("Save the storefront draft before publishing.");
  }

  const document = storefrontDocumentSchema.parse(config.draftDocument);
  await db.$transaction([
    db.storefrontConfig.update({
      where: { boothId },
      data: {
        publishedDocument: document,
        publishedAt: new Date(),
        updatedById: session.user.id,
      },
    }),
    db.booth.update({
      where: { id: boothId },
      data: { name: document.name, status: "PUBLISHED" },
    }),
    db.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "storefront.published",
        entityType: "StorefrontConfig",
        entityId: boothId,
      },
    }),
  ]);

  revalidatePath(`/manage/${boothId}/storefront`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/storefront?published=1`);
}

const productStatusSchema = z.enum(["DRAFT", "LIVE", "SOLD_OUT", "HIDDEN"]);
const variantStatusSchema = z.enum([
  "AVAILABLE",
  "LOW_STOCK",
  "PREORDER",
  "SOLD_OUT",
  "HIDDEN",
]);

export async function saveProductAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  let productId = optionalText(formData, "productId");
  const variantId = optionalText(formData, "variantId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const name = requiredText(formData, "name");
  const slug = slugify(requiredText(formData, "slug") || name);
  const sku = requiredText(formData, "sku").toLocaleUpperCase();
  const priceVnd = Number(requiredText(formData, "priceVnd"));
  if (
    !name ||
    !slug ||
    !sku ||
    !Number.isFinite(priceVnd) ||
    priceVnd < 0 ||
    priceVnd > MAX_PRODUCT_PRICE_VND
  ) {
    throw new Error(
      `Name, slug, SKU, and a price between 0 and ${MAX_PRODUCT_PRICE_VND.toLocaleString("en-US")} VND are required.`,
    );
  }

  const priceCents = BigInt(Math.round(priceVnd * 100));
  const status = productStatusSchema.parse(requiredText(formData, "status"));
  const variantStatus = variantStatusSchema.parse(
    requiredText(formData, "variantStatus"),
  );
  const tags = requiredText(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  const imageObjectKey = optionalText(formData, "imageObjectKey");

  const savedProductId = await db.$transaction(async (transaction) => {
    if (productId) {
      const existing = await transaction.product.findFirst({
        where: { id: productId, boothId },
      });
      if (!existing) throw new Error("Product not found in this booth.");

      await transaction.product.update({
        where: { id: productId },
        data: {
          name,
          slug,
          sku,
          eyebrow: optionalText(formData, "eyebrow"),
          shortDescription: optionalText(formData, "shortDescription"),
          description: requiredText(formData, "description"),
          priceCents,
          status,
          featured: booleanField(formData, "featured"),
          tags,
        },
      });
      if (variantId) {
        await transaction.productVariant.updateMany({
          where: { id: variantId, productId },
          data: {
            sku,
            label: requiredText(formData, "variantLabel") || "Standard",
            priceCents,
            status: variantStatus,
            stockQuantity: optionalText(formData, "stockQuantity")
              ? parseInteger(formData.get("stockQuantity"), 0)
              : null,
            fulfillmentNote: optionalText(formData, "fulfillmentNote"),
          },
        });
      }
    } else {
      const created = await transaction.product.create({
        data: {
          boothId,
          name,
          slug,
          sku,
          eyebrow: optionalText(formData, "eyebrow"),
          shortDescription: optionalText(formData, "shortDescription"),
          description: requiredText(formData, "description"),
          priceCents,
          status,
          featured: booleanField(formData, "featured"),
          tags,
          variants: {
            create: {
              sku,
              label: requiredText(formData, "variantLabel") || "Standard",
              priceCents,
              status: variantStatus,
              stockQuantity: optionalText(formData, "stockQuantity")
                ? parseInteger(formData.get("stockQuantity"), 0)
                : null,
              fulfillmentNote: optionalText(formData, "fulfillmentNote"),
            },
          },
        },
      });
      productId = created.id;
    }

    if (!productId) throw new Error("Product could not be saved.");
    await transaction.productImage.deleteMany({ where: { productId } });
    if (imageObjectKey) {
      await transaction.productImage.create({
        data: {
          productId,
          objectKey: imageObjectKey,
          alt: requiredText(formData, "imageAlt") || name,
        },
      });
    }
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: productId ? "product.saved" : "product.created",
        entityType: "Product",
        entityId: productId,
      },
    });
    return productId;
  });

  revalidatePath(`/manage/${boothId}/products`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/products?product=${savedProductId}&saved=1`);
}

export async function hideProductAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const productId = requiredText(formData, "productId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const result = await db.product.updateMany({
    where: { id: productId, boothId },
    data: { status: "HIDDEN" },
  });
  if (!result.count) throw new Error("Product not found in this booth.");
  await db.auditLog.create({
    data: {
      boothId,
      actorUserId: session.user.id,
      action: "product.hidden",
      entityType: "Product",
      entityId: productId,
    },
  });
  revalidatePath(`/manage/${boothId}/products`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/products`);
}

export async function savePromotionAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  await requireBoothRole(boothId, editorRoles);
  const promotionId = optionalText(formData, "promotionId");
  const data = {
    name: requiredText(formData, "name") || "Quantity promotion",
    buyQuantity: Math.max(1, parseInteger(formData.get("buyQuantity"), 3)),
    rewardQuantity: Math.max(
      1,
      parseInteger(formData.get("rewardQuantity"), 1),
    ),
    active: booleanField(formData, "active"),
    repeatable: booleanField(formData, "repeatable"),
  };
  if (promotionId) {
    await db.quantityPromotion.updateMany({
      where: { id: promotionId, boothId },
      data,
    });
  } else {
    await db.quantityPromotion.create({ data: { boothId, ...data } });
  }
  revalidatePath(`/manage/${boothId}/products`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const orderId = requiredText(formData, "orderId");
  const nextStatus = z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED", "FULFILLED"])
    .parse(requiredText(formData, "status"));
  const { session } = await requireBoothRole(boothId, orderRoles);
  const result = await db.order.updateMany({
    where: { id: orderId, boothId },
    data: {
      status: nextStatus,
      confirmedAt: nextStatus === "CONFIRMED" ? new Date() : undefined,
      confirmedById: nextStatus === "CONFIRMED" ? session.user.id : undefined,
      fulfilledAt: nextStatus === "FULFILLED" ? new Date() : undefined,
    },
  });
  if (!result.count) throw new Error("Order not found in this booth.");
  await db.auditLog.create({
    data: {
      boothId,
      actorUserId: session.user.id,
      action: `order.${nextStatus.toLocaleLowerCase()}`,
      entityType: "Order",
      entityId: orderId,
      metadata: { manualReview: true },
    },
  });
  revalidatePath(`/manage/${boothId}/orders`);
}

export async function saveGachaAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const { session } = await requireBoothRole(boothId, editorRoles);
  const guaranteedAt = Math.min(
    500,
    Math.max(1, parseInteger(formData.get("guaranteedAt"), 50)),
  );
  await db.$transaction(async (transaction) => {
    await transaction.gachaConfig.upsert({
      where: { boothId },
      create: {
        boothId,
        enabled: booleanField(formData, "enabled"),
        title: requiredText(formData, "title"),
        introduction: requiredText(formData, "introduction"),
        gameTheme: requiredText(formData, "gameTheme") || "anemo",
        pityEnabled: booleanField(formData, "pityEnabled"),
        guaranteedAt,
        rates: { common: 70, rare: 24, epic: 5, legendary: 1 },
      },
      update: {
        enabled: booleanField(formData, "enabled"),
        title: requiredText(formData, "title"),
        introduction: requiredText(formData, "introduction"),
        gameTheme: requiredText(formData, "gameTheme") || "anemo",
        pityEnabled: booleanField(formData, "pityEnabled"),
        guaranteedAt,
      },
    });
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "gacha.config_saved",
        entityType: "GachaConfig",
        entityId: boothId,
        metadata: { freeOnly: true },
      },
    });
  });
  revalidatePath(`/manage/${boothId}/gacha`);
  redirect(`/manage/${boothId}/gacha?saved=1`);
}

export async function saveGachaBannerAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  await requireBoothRole(boothId, editorRoles);
  const bannerId = optionalText(formData, "bannerId");
  const data = {
    title: requiredText(formData, "bannerTitle"),
    copy: requiredText(formData, "bannerCopy"),
    type: z
      .enum(["CHARACTER", "WEAPON", "COLLECTION"])
      .parse(requiredText(formData, "bannerType")),
    theme: requiredText(formData, "bannerTheme") || "anemo",
    featuredCount: Math.min(
      10,
      Math.max(1, parseInteger(formData.get("featuredCount"), 3)),
    ),
    active: booleanField(formData, "bannerActive"),
  } as const;

  let savedBannerId = bannerId;
  if (bannerId) {
    const result = await db.gachaBanner.updateMany({
      where: { id: bannerId, boothId },
      data,
    });
    if (!result.count) throw new Error("Banner not found in this booth.");
  } else {
    const created = await db.gachaBanner.create({
      data: { boothId, ...data },
    });
    savedBannerId = created.id;
  }

  revalidatePath(`/manage/${boothId}/gacha`);
  redirect(`/manage/${boothId}/gacha?banner=${savedBannerId}&saved=1`);
}

export async function saveGachaPoolAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const bannerId = requiredText(formData, "bannerId");
  await requireBoothRole(boothId, editorRoles);
  const banner = await db.gachaBanner.findFirst({
    where: { id: bannerId, boothId },
  });
  if (!banner) throw new Error("Banner not found in this booth.");

  const requestedVariantIds = formData
    .getAll("variantId")
    .map(String)
    .filter(Boolean);
  const variants = await db.productVariant.findMany({
    where: {
      id: { in: requestedVariantIds },
      product: { boothId },
    },
    include: { product: true },
  });

  await db.$transaction(async (transaction) => {
    await transaction.gachaPoolEntry.deleteMany({ where: { bannerId } });
    if (variants.length) {
      await transaction.gachaPoolEntry.createMany({
        data: variants.map((variant, index) => ({
          bannerId,
          productVariantId: variant.id,
          displayName: `${variant.product.name} · ${variant.label}`,
          rarity: index === 0 ? "EPIC" : "COMMON",
          weight: index === 0 ? 5 : 20,
          featured: index === 0,
          sortOrder: index,
        })),
      });
    }
  });
  revalidatePath(`/manage/${boothId}/gacha`);
}

export async function inviteTeamMemberAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const email = z
    .email()
    .parse(requiredText(formData, "email").toLocaleLowerCase());
  const role = z.enum(["ADMIN", "STAFF"]).parse(requiredText(formData, "role"));
  const existingMember = await db.boothMembership.findFirst({
    where: { boothId, user: { email } },
  });
  if (existingMember)
    throw new Error("This person already belongs to the booth.");

  const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  await db.teamInvitation.create({
    data: {
      boothId,
      email,
      role,
      tokenHash,
      invitedById: session.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await db.auditLog.create({
    data: {
      boothId,
      actorUserId: session.user.id,
      action: "team.invited",
      entityType: "TeamInvitation",
      metadata: { email, role },
    },
  });
  revalidatePath(`/manage/${boothId}/team`);
  redirect(`/manage/${boothId}/team?invited=1`);
}

export async function updateTeamMemberAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const membershipId = requiredText(formData, "membershipId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const membership = await db.boothMembership.findFirst({
    where: { id: membershipId, boothId },
  });
  if (!membership || membership.role === "OWNER") {
    throw new Error("The booth owner cannot be changed here.");
  }
  const role = z.enum(["ADMIN", "STAFF"]).parse(requiredText(formData, "role"));
  const status = z
    .enum(["ACTIVE", "DISABLED"])
    .parse(requiredText(formData, "status"));
  await db.boothMembership.update({
    where: { id: membershipId },
    data: { role, status },
  });
  await db.auditLog.create({
    data: {
      boothId,
      actorUserId: session.user.id,
      action: "team.member_updated",
      entityType: "BoothMembership",
      entityId: membershipId,
      metadata: { role, status },
    },
  });
  revalidatePath(`/manage/${boothId}/team`);
}
