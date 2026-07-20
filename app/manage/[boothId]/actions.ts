"use server";

import { createHash, randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBoothRole, requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  discardUploadedPaymentQr,
  discardUploadedProductImage,
  OracleQrUploadError,
  OracleProductImageUploadError,
  uploadPaymentQr,
  uploadProductImage,
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

export type ProductSaveState = { error: string | null };

const hasCode = (error: unknown, code: string) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === code;

export async function saveProductAction(
  previousState: ProductSaveState,
  formData: FormData,
): Promise<ProductSaveState> {
  return Sentry.withServerActionInstrumentation(
    "saveProductAction",
    { recordResponse: false },
    () => saveProduct(previousState, formData),
  );
}

async function saveProduct(
  _previousState: ProductSaveState,
  formData: FormData,
): Promise<ProductSaveState> {
  const boothId = requiredText(formData, "boothId");
  const productId = optionalText(formData, "productId");
  const variantId = optionalText(formData, "variantId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const name = requiredText(formData, "name");
  const slug = slugify(requiredText(formData, "slug") || name);
  const sku = requiredText(formData, "sku").toLocaleUpperCase();
  const rawPrice = requiredText(formData, "priceVnd");
  const priceVnd = Number(rawPrice);
  if (
    !name ||
    !slug ||
    !sku ||
    !rawPrice ||
    !Number.isFinite(priceVnd) ||
    priceVnd < 0 ||
    priceVnd > MAX_PRODUCT_PRICE_VND
  ) {
    return {
      error: `Name, slug, SKU, and a price between 0 and ${MAX_PRODUCT_PRICE_VND.toLocaleString("en-US")} VND are required.`,
    };
  }

  const priceCents = BigInt(Math.round(priceVnd * 100));
  const statusResult = productStatusSchema.safeParse(
    requiredText(formData, "status"),
  );
  const variantStatusResult = variantStatusSchema.safeParse(
    requiredText(formData, "variantStatus"),
  );
  if (!statusResult.success || !variantStatusResult.success) {
    return { error: "Choose a valid product and variant status." };
  }
  const status = statusResult.data;
  const variantStatus = variantStatusResult.data;
  const tags = requiredText(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  const imageFile = formData.get("productImage");
  const removeImage = booleanField(formData, "removeImage");
  const existing = productId
    ? await db.product.findFirst({
        where: { id: productId, boothId },
        include: {
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      })
    : null;
  if (productId && !existing) {
    return {
      error: "That product is no longer available. Refresh and try again.",
    };
  }

  let uploadedImageObjectKey: string | null = null;
  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      uploadedImageObjectKey = await uploadProductImage({
        boothId,
        file: imageFile,
      });
    } catch (error) {
      if (error instanceof OracleProductImageUploadError) {
        return { error: error.message };
      }
      throw error;
    }
  }

  const existingImage = existing?.images[0] ?? null;
  const imageObjectKey = uploadedImageObjectKey
    ? uploadedImageObjectKey
    : removeImage
      ? null
      : (existingImage?.objectKey ?? null);
  let savedProductId: string;

  try {
    savedProductId = await db.$transaction(async (transaction) => {
      let nextProductId = productId;
      const auditAction = productId ? "product.saved" : "product.created";

      if (productId) {
        const current = await transaction.product.findFirst({
          where: { id: productId, boothId },
        });
        if (!current) throw new Error("Product not found in this booth.");

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
                ? Math.max(0, parseInteger(formData.get("stockQuantity"), 0))
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
                  ? Math.max(0, parseInteger(formData.get("stockQuantity"), 0))
                  : null,
                fulfillmentNote: optionalText(formData, "fulfillmentNote"),
              },
            },
          },
          select: { id: true },
        });
        nextProductId = created.id;
      }

      if (!nextProductId) throw new Error("Product could not be saved.");
      if (uploadedImageObjectKey || removeImage || !productId) {
        await transaction.productImage.deleteMany({
          where: { productId: nextProductId },
        });
        if (imageObjectKey) {
          await transaction.productImage.create({
            data: {
              productId: nextProductId,
              objectKey: imageObjectKey,
              alt:
                requiredText(formData, "imageAlt") ||
                existingImage?.alt ||
                name,
            },
          });
        }
      } else if (existingImage && requiredText(formData, "imageAlt")) {
        await transaction.productImage.update({
          where: { id: existingImage.id },
          data: { alt: requiredText(formData, "imageAlt") },
        });
      }
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: auditAction,
          entityType: "Product",
          entityId: nextProductId,
        },
      });
      return nextProductId;
    });
  } catch (error) {
    if (uploadedImageObjectKey) {
      await discardUploadedProductImage(uploadedImageObjectKey);
    }
    if (hasCode(error, "P2002")) {
      return {
        error:
          "That slug or SKU is already used in this booth. Choose a unique value.",
      };
    }
    if (
      error instanceof Error &&
      error.message === "Product not found in this booth."
    ) {
      return {
        error: "That product is no longer available. Refresh and try again.",
      };
    }
    Sentry.captureException(error, {
      tags: {
        "cyfurden.operation": "product.save",
        "cyfurden.product.mode": productId ? "edit" : "create",
        "cyfurden.product.image_upload": uploadedImageObjectKey
          ? "completed"
          : imageFile instanceof File && imageFile.size > 0
            ? "requested"
            : "none",
      },
      contexts: {
        productSave: {
          hasExistingProduct: Boolean(productId),
          removeImage,
        },
      },
    });
    console.error("Failed to save product", error);
    if (hasCode(error, "P2020")) {
      return {
        error:
          "The database rejected the price or stock value. If those values are correct, apply the latest database migrations and try again.",
      };
    }
    return {
      error: "We could not save this product. Check the fields and try again.",
    };
  }

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

export type OrderStatusActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateOrderStatusAction(
  _previousState: OrderStatusActionState,
  formData: FormData,
): Promise<OrderStatusActionState> {
  const boothId = requiredText(formData, "boothId");
  const orderId = requiredText(formData, "orderId");
  const parsedStatus = z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED", "FULFILLED"])
    .safeParse(requiredText(formData, "status"));

  if (!boothId || !orderId || !parsedStatus.success) {
    return {
      status: "error",
      message: "Choose a valid order status and try again.",
    };
  }

  try {
    const nextStatus = parsedStatus.data;
    const { session } = await requireBoothRole(boothId, orderRoles);
    const result = await db.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { id: orderId, boothId },
        select: {
          code: true,
          status: true,
          confirmedAt: true,
          confirmedById: true,
        },
      });

      if (!order) return null;
      if (order.status === nextStatus) {
        return { code: order.code, changed: false };
      }

      const now = new Date();
      const keepsConfirmation =
        nextStatus === "CONFIRMED" || nextStatus === "FULFILLED";

      const updated = await transaction.order.updateMany({
        where: { id: orderId, boothId },
        data: {
          status: nextStatus,
          confirmedAt: keepsConfirmation ? (order.confirmedAt ?? now) : null,
          confirmedById: keepsConfirmation
            ? (order.confirmedById ?? session.user.id)
            : null,
          fulfilledAt: nextStatus === "FULFILLED" ? now : null,
        },
      });
      if (!updated.count) return null;
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: `order.${nextStatus.toLocaleLowerCase()}`,
          entityType: "Order",
          entityId: orderId,
          metadata: { manualReview: true },
        },
      });
      return { code: order.code, changed: true };
    });

    if (!result) {
      return {
        status: "error",
        message: "This order was not found in the active booth.",
      };
    }

    if (result.changed) revalidatePath(`/manage/${boothId}/orders`);
    const label = nextStatus.toLocaleLowerCase().replaceAll("_", " ");
    return {
      status: "success",
      message: result.changed
        ? `${result.code} is now ${label}.`
        : `${result.code} is already ${label}.`,
    };
  } catch (error) {
    console.error("Order status update failed", error);
    return {
      status: "error",
      message: "The status could not be saved. Try again.",
    };
  }
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
  redirect(`/manage/${boothId}/gacha?banner=${bannerId}&poolSaved=1`);
}

const teamInviteSchema = z.object({
  email: z
    .email("Enter a valid email address.")
    .max(254)
    .transform((value) => value.trim().toLocaleLowerCase()),
  role: z.enum(["ADMIN", "STAFF"]),
});

const teamMemberUpdateSchema = z.object({
  role: z.enum(["ADMIN", "STAFF"]),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export type TeamInviteState = {
  error?: string;
  invitationPath?: string;
  invitedEmail?: string;
};

export type TeamMutationState = {
  error?: string;
  success?: string;
};

export type InvitationAcceptanceState = TeamMutationState & {
  boothName?: string;
  workspacePath?: string;
};

const expireStaleInvitations = async (
  transaction: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  boothId: string,
  now: Date,
) =>
  transaction.teamInvitation.updateMany({
    where: { boothId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

export async function inviteTeamMemberAction(
  _previousState: TeamInviteState,
  formData: FormData,
): Promise<TeamInviteState> {
  const boothId = requiredText(formData, "boothId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const parsed = teamInviteSchema.safeParse({
    email: requiredText(formData, "email"),
    role: requiredText(formData, "role"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the invitation.",
    };
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await db.$transaction(
      async (transaction) => {
        const now = new Date();
        await expireStaleInvitations(transaction, boothId, now);
        const [existingMember, pendingInvite, activeMembers, pendingInvites] =
          await Promise.all([
            transaction.boothMembership.findFirst({
              where: {
                boothId,
                user: {
                  email: { equals: parsed.data.email, mode: "insensitive" },
                },
              },
            }),
            transaction.teamInvitation.findFirst({
              where: {
                boothId,
                email: parsed.data.email,
                status: "PENDING",
                expiresAt: { gt: now },
              },
            }),
            transaction.boothMembership.count({
              where: { boothId, status: "ACTIVE" },
            }),
            transaction.teamInvitation.count({
              where: { boothId, status: "PENDING", expiresAt: { gt: now } },
            }),
          ]);

        if (existingMember) {
          return { error: "This person already belongs to the booth." };
        }
        if (pendingInvite) {
          return {
            error: "An active invitation already exists for this email.",
          };
        }
        if (activeMembers + pendingInvites >= 10) {
          return {
            error:
              "This booth has filled all 10 active-member and pending-invitation places.",
          };
        }

        const invitation = await transaction.teamInvitation.create({
          data: {
            boothId,
            email: parsed.data.email,
            role: parsed.data.role,
            tokenHash,
            invitedById: session.user.id,
            expiresAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            boothId,
            actorUserId: session.user.id,
            action: "team.invited",
            entityType: "TeamInvitation",
            entityId: invitation.id,
            metadata: { email: parsed.data.email, role: parsed.data.role },
          },
        });
        return { invitation };
      },
      { isolationLevel: "Serializable" },
    );

    if ("error" in result) return { error: result.error };
  } catch (error) {
    console.error("Failed to create team invitation", error);
    return {
      error: "The invitation could not be created. Please try again.",
    };
  }

  revalidatePath(`/manage/${boothId}/team`);
  return {
    invitationPath: `/invitations/${token}`,
    invitedEmail: parsed.data.email,
  };
}

export async function revokeTeamInvitationAction(
  _previousState: TeamMutationState,
  formData: FormData,
): Promise<TeamMutationState> {
  const boothId = requiredText(formData, "boothId");
  const invitationId = requiredText(formData, "invitationId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  let result: boolean;
  try {
    result = await db.$transaction(async (transaction) => {
      const revoked = await transaction.teamInvitation.updateMany({
        where: { id: invitationId, boothId, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      if (!revoked.count) return false;
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: "team.invitation_revoked",
          entityType: "TeamInvitation",
          entityId: invitationId,
        },
      });
      return true;
    });
  } catch (error) {
    console.error("Failed to revoke team invitation", error);
    return { error: "The invitation could not be revoked. Try again." };
  }
  if (!result) return { error: "This invitation is no longer active." };
  revalidatePath(`/manage/${boothId}/team`);
  return { success: "Invitation revoked." };
}

export async function updateTeamMemberAction(
  _previousState: TeamMutationState,
  formData: FormData,
): Promise<TeamMutationState> {
  const boothId = requiredText(formData, "boothId");
  const membershipId = requiredText(formData, "membershipId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const parsed = teamMemberUpdateSchema.safeParse({
    role: requiredText(formData, "role"),
    status: requiredText(formData, "status"),
  });
  if (!parsed.success)
    return { error: "Choose a valid role and access state." };

  let result: TeamMutationState;
  try {
    result = await db.$transaction(
      async (transaction) => {
        const now = new Date();
        await expireStaleInvitations(transaction, boothId, now);
        const membership = await transaction.boothMembership.findFirst({
          where: { id: membershipId, boothId },
        });
        if (!membership) return { error: "This member could not be found." };
        if (membership.role === "OWNER") {
          return { error: "The booth owner cannot be changed here." };
        }
        if (membership.status !== "ACTIVE" && parsed.data.status === "ACTIVE") {
          const [activeMembers, pendingInvites] = await Promise.all([
            transaction.boothMembership.count({
              where: { boothId, status: "ACTIVE" },
            }),
            transaction.teamInvitation.count({
              where: { boothId, status: "PENDING", expiresAt: { gt: now } },
            }),
          ]);
          if (activeMembers + pendingInvites >= 10) {
            return {
              error: "Revoke an invitation before enabling this member.",
            };
          }
        }

        await transaction.boothMembership.update({
          where: { id: membershipId },
          data: parsed.data,
        });
        await transaction.auditLog.create({
          data: {
            boothId,
            actorUserId: session.user.id,
            action: "team.member_updated",
            entityType: "BoothMembership",
            entityId: membershipId,
            metadata: parsed.data,
          },
        });
        return { success: "Member access updated." };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("Failed to update team member", error);
    return { error: "Member access could not be updated. Try again." };
  }

  if (result.success) revalidatePath(`/manage/${boothId}/team`);
  return result;
}

export async function acceptTeamInvitationAction(
  _previousState: InvitationAcceptanceState,
  formData: FormData,
): Promise<InvitationAcceptanceState> {
  const token = requiredText(formData, "token");
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { error: "This invitation link is invalid." };
  }
  const session = await requireUser(`/invitations/${token}`);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sessionEmail = session.user.email.trim().toLocaleLowerCase();

  let result: InvitationAcceptanceState;
  try {
    result = await db.$transaction(
      async (transaction) => {
        const invitation = await transaction.teamInvitation.findUnique({
          where: { tokenHash },
          include: { booth: true },
        });
        if (!invitation) return { error: "This invitation link is invalid." };
        if (invitation.status !== "PENDING") {
          return { error: "This invitation is no longer active." };
        }
        if (invitation.expiresAt <= new Date()) {
          await transaction.teamInvitation.update({
            where: { id: invitation.id },
            data: { status: "EXPIRED" },
          });
          return { error: "This invitation has expired." };
        }
        if (invitation.email.toLocaleLowerCase() !== sessionEmail) {
          return {
            error: `Sign in as ${invitation.email} to accept this invitation.`,
          };
        }

        const existingMembership = await transaction.boothMembership.findUnique(
          {
            where: {
              boothId_userId: {
                boothId: invitation.boothId,
                userId: session.user.id,
              },
            },
          },
        );
        if (existingMembership?.role === "OWNER") {
          return { error: "The booth owner does not need an invitation." };
        }
        if (existingMembership) {
          await transaction.boothMembership.update({
            where: { id: existingMembership.id },
            data: { role: invitation.role, status: "ACTIVE" },
          });
        } else {
          await transaction.boothMembership.create({
            data: {
              boothId: invitation.boothId,
              userId: session.user.id,
              role: invitation.role,
              status: "ACTIVE",
            },
          });
        }
        const accepted = await transaction.teamInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING" },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedById: session.user.id,
          },
        });
        if (!accepted.count) {
          return { error: "This invitation was already used." };
        }
        await transaction.auditLog.create({
          data: {
            boothId: invitation.boothId,
            actorUserId: session.user.id,
            action: "team.invitation_accepted",
            entityType: "TeamInvitation",
            entityId: invitation.id,
            metadata: { role: invitation.role },
          },
        });
        return {
          boothName: invitation.booth.name,
          workspacePath: `/manage/${invitation.boothId}/orders`,
        };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("Failed to accept team invitation", error);
    return { error: "The invitation could not be accepted. Try again." };
  }

  if (result.workspacePath) {
    revalidatePath("/dashboard");
    revalidatePath(`/manage/${result.workspacePath.split("/")[2]}/team`);
    return {
      success: "Invitation accepted.",
      boothName: result.boothName,
      workspacePath: result.workspacePath,
    };
  }
  return result;
}
