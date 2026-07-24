"use server";

import { createHash, randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBoothRole, requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  canTransitionOrderStatus,
  type OrderStatusName,
  releasesInventory,
} from "@/lib/order-rules";
import {
  discardUploadedPaymentQr,
  discardUploadedProductImage,
  OracleQrUploadError,
  uploadPaymentQr,
} from "@/lib/oracle-uploads";
import {
  OracleLogoVerificationError,
  OracleProductImageVerificationError,
  verifyBoothLogoUpload,
  verifyBoothProductImageUpload,
} from "@/lib/oracle-presign";
import { isBoothProductImageObjectKey } from "@/lib/oracle-presign-contract";
import { PRODUCT_IMAGE_MAX_COUNT } from "@/lib/payment-qr";
import {
  storefrontDocumentSchema,
  storefrontSectionIds,
} from "@/lib/storefront-document";
import {
  boothSocialLinksSchema,
  compactBoothSocialLinks,
  isBoothLogoObjectKey,
  socialPlatforms,
} from "@/lib/shop-settings";

const editorRoles = ["OWNER", "ADMIN"] as const;
const orderRoles = ["OWNER", "ADMIN", "STAFF"] as const;
const MAX_PRODUCT_PRICE_VND = 9_000_000_000_000;
const MAX_STOCK_QUANTITY = 2_147_483_647;

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

const paymentDraftSchema = z.object({
  bankName: z.string().trim().max(120),
  bankCode: z
    .string()
    .trim()
    .regex(/^$|^\d{6}$/, "Use the six-digit bank BIN/code for VietQR."),
  accountName: z.string().trim().max(120),
  accountNumber: z.string().trim().max(80),
  paymentLabel: z.string().trim().min(2).max(80),
  transferReferenceTemplate: z.string().trim().max(120),
  instructions: z.string().trim().max(2_000),
  disclaimer: z.string().trim().max(1_000),
});

const productImageManifestSchema = z
  .array(
    z.union([
      z
        .object({
          existingId: z.string().trim().min(1).max(64),
          alt: z.string().trim().max(300),
        })
        .strict(),
      z
        .object({
          objectKey: z.string().trim().min(1).max(300),
          alt: z.string().trim().max(300),
        })
        .strict(),
    ]),
  )
  .max(PRODUCT_IMAGE_MAX_COUNT);

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
  const documentResult = storefrontDocumentSchema.safeParse({
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
  if (!documentResult.success) {
    return {
      error:
        documentResult.error.issues[0]?.message ??
        "Check the storefront fields and try again.",
    };
  }
  const document = documentResult.data;
  const paymentResult = paymentDraftSchema.safeParse({
    bankName: requiredText(formData, "bankName"),
    bankCode: requiredText(formData, "bankCode"),
    accountName: requiredText(formData, "accountName"),
    accountNumber: requiredText(formData, "accountNumber"),
    paymentLabel: requiredText(formData, "paymentLabel"),
    transferReferenceTemplate: requiredText(
      formData,
      "transferReferenceTemplate",
    ),
    instructions: requiredText(formData, "paymentInstructions"),
    disclaimer: requiredText(formData, "paymentDisclaimer"),
  });
  if (!paymentResult.success) {
    return {
      error:
        paymentResult.error.issues[0]?.message ??
        "Check the payment instruction fields and try again.",
    };
  }
  const payment = paymentResult.data;
  const socialResult = boothSocialLinksSchema.safeParse(
    Object.fromEntries(
      socialPlatforms.map(({ id }) => [
        id,
        requiredText(formData, `social-${id}`),
      ]),
    ),
  );
  if (!socialResult.success) {
    return {
      error:
        socialResult.error.issues[0]?.message ??
        "Check the social links and try again.",
    };
  }
  const logoObjectKey = requiredText(formData, "logoObjectKey");
  if (logoObjectKey && !isBoothLogoObjectKey(boothId, logoObjectKey)) {
    return {
      error:
        "The selected logo does not belong to this booth. Upload it again.",
    };
  }
  if (logoObjectKey && logoObjectKey !== booth.logoObjectKey) {
    try {
      await verifyBoothLogoUpload({ boothId, objectKey: logoObjectKey });
    } catch (error) {
      if (error instanceof OracleLogoVerificationError) {
        return { error: error.message };
      }
      throw error;
    }
  }

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
          bankName: payment.bankName,
          bankCode: payment.bankCode || null,
          accountName: payment.accountName,
          accountNumber: payment.accountNumber,
          paymentLabel: payment.paymentLabel,
          qrObjectKey,
          transferReferenceTemplate:
            payment.transferReferenceTemplate || "CYF-{ORDER}",
          instructions: payment.instructions,
          disclaimer:
            payment.disclaimer ||
            "Bank transfers are reviewed manually. This storefront does not verify payment automatically.",
        },
        update: {
          bankName: payment.bankName,
          bankCode: payment.bankCode || null,
          accountName: payment.accountName,
          accountNumber: payment.accountNumber,
          paymentLabel: payment.paymentLabel,
          qrObjectKey,
          transferReferenceTemplate:
            payment.transferReferenceTemplate || "CYF-{ORDER}",
          instructions: payment.instructions,
          disclaimer:
            payment.disclaimer ||
            "Bank transfers are reviewed manually. This storefront does not verify payment automatically.",
        },
      });
      await transaction.booth.update({
        where: { id: boothId },
        data: {
          name: document.name,
          logoObjectKey: logoObjectKey || null,
          socialLinks: compactBoothSocialLinks(socialResult.data),
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

export type DeleteBoothState = { error: string | null };

export async function deleteBoothAction(
  _previousState: DeleteBoothState,
  formData: FormData,
): Promise<DeleteBoothState> {
  const boothId = requiredText(formData, "boothId");
  const confirmation = requiredText(formData, "confirmation");
  const { session, booth } = await requireBoothRole(boothId, ["OWNER"]);

  if (booth.ownerId !== session.user.id) {
    return { error: "Only the booth owner can delete this booth." };
  }
  if (confirmation !== booth.slug) {
    return { error: `Type ${booth.slug} exactly to confirm deletion.` };
  }

  const result = await db.$transaction(
    async (transaction) => {
      const orderCount = await transaction.order.count({ where: { boothId } });
      if (orderCount > 0) {
        return {
          error:
            "This booth has order history and cannot be deleted. Archive support belongs to a later lifecycle milestone.",
        };
      }

      const deleted = await transaction.booth.deleteMany({
        where: { id: boothId, ownerId: session.user.id },
      });
      return deleted.count
        ? { error: null }
        : { error: "The booth no longer exists or is no longer yours." };
    },
    { isolationLevel: "Serializable" },
  );

  if (result.error) return result;
  revalidatePath("/dashboard");
  redirect("/dashboard?deleted=1");
}

const productStatusSchema = z.enum(["DRAFT", "LIVE", "SOLD_OUT", "HIDDEN"]);
const variantStatusSchema = z.enum([
  "AVAILABLE",
  "LOW_STOCK",
  "PREORDER",
  "SOLD_OUT",
  "HIDDEN",
]);

export type ProductSaveState = {
  error: string | null;
  discardedImageObjectKeys?: string[];
};

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

export async function discardProductImageUploadAction(
  boothId: string,
  objectKey: string,
) {
  await requireBoothRole(boothId, editorRoles);
  if (!isBoothProductImageObjectKey(boothId, objectKey)) return;
  const attached = await db.productImage.findFirst({
    where: { objectKey, product: { boothId } },
    select: { id: true },
  });
  if (!attached) await discardUploadedProductImage(objectKey);
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
  const description = requiredText(formData, "description");
  const eyebrow = requiredText(formData, "eyebrow");
  const shortDescription = requiredText(formData, "shortDescription");
  const variantLabel = requiredText(formData, "variantLabel") || "Standard";
  const fulfillmentNote = requiredText(formData, "fulfillmentNote");
  const rawStockQuantity = requiredText(formData, "stockQuantity");
  const stockQuantity = rawStockQuantity ? Number(rawStockQuantity) : null;
  if (
    name.length < 2 ||
    name.length > 120 ||
    !slug ||
    !/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(sku) ||
    !rawPrice ||
    !Number.isSafeInteger(priceVnd) ||
    priceVnd < 0 ||
    priceVnd > MAX_PRODUCT_PRICE_VND
  ) {
    return {
      error: `Use a 2-120 character name, a SKU made from letters, numbers, dots, underscores, or hyphens, and a whole-number price between 0 and ${MAX_PRODUCT_PRICE_VND.toLocaleString("en-US")} VND.`,
    };
  }
  if (
    description.length < 1 ||
    description.length > 5_000 ||
    eyebrow.length > 80 ||
    shortDescription.length > 240 ||
    variantLabel.length > 80 ||
    fulfillmentNote.length > 500
  ) {
    return {
      error:
        "Keep the description under 5,000 characters and the supporting labels within their displayed limits.",
    };
  }
  if (
    stockQuantity !== null &&
    (!Number.isSafeInteger(stockQuantity) ||
      stockQuantity < 0 ||
      stockQuantity > MAX_STOCK_QUANTITY)
  ) {
    return {
      error: `Stock must be a whole number from 0 to ${MAX_STOCK_QUANTITY.toLocaleString("en-US")}, or blank when untracked.`,
    };
  }

  let rawImageManifest: unknown;
  try {
    rawImageManifest = JSON.parse(requiredText(formData, "imageManifest"));
  } catch {
    return {
      error: "The product image list is invalid. Refresh and try again.",
    };
  }
  const imageManifestResult =
    productImageManifestSchema.safeParse(rawImageManifest);
  if (!imageManifestResult.success) {
    return {
      error: `Use no more than ${PRODUCT_IMAGE_MAX_COUNT} product images and keep alt text under 300 characters.`,
    };
  }
  const imageManifest = imageManifestResult.data;
  const manifestIdentifiers = imageManifest.map((image) =>
    "existingId" in image
      ? `existing:${image.existingId}`
      : `new:${image.objectKey}`,
  );
  if (new Set(manifestIdentifiers).size !== manifestIdentifiers.length) {
    return { error: "The product image list contains duplicates." };
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
    .map((tag) => tag.trim().toLocaleLowerCase())
    .filter(Boolean)
    .filter((tag) => tag.length <= 40)
    .slice(0, 12);
  const existing = productId
    ? await db.product.findFirst({
        where: { id: productId, boothId },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          variants: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      })
    : null;
  if (productId && !existing) {
    return {
      error: "That product is no longer available. Refresh and try again.",
    };
  }

  const existingImagesById = new Map(
    (existing?.images ?? []).map((image) => [image.id, image]),
  );
  const retainedExistingIds = imageManifest
    .filter(
      (image): image is { existingId: string; alt: string } =>
        "existingId" in image,
    )
    .map((image) => image.existingId);
  if (retainedExistingIds.some((imageId) => !existingImagesById.has(imageId))) {
    return {
      error:
        "One of the existing product images is no longer available. Refresh and try again.",
    };
  }
  const uploadedImageObjectKeys = imageManifest
    .filter(
      (image): image is { objectKey: string; alt: string } =>
        "objectKey" in image,
    )
    .map((image) => image.objectKey);
  if (
    uploadedImageObjectKeys.some(
      (objectKey) => !isBoothProductImageObjectKey(boothId, objectKey),
    )
  ) {
    return {
      error: "An uploaded product image does not belong to this booth.",
    };
  }
  if (uploadedImageObjectKeys.length) {
    const attachedUpload = await db.productImage.findFirst({
      where: { objectKey: { in: uploadedImageObjectKeys } },
      select: { id: true },
    });
    if (attachedUpload) {
      return {
        error:
          "An uploaded product image is already attached. Refresh and try again.",
      };
    }
  }
  try {
    for (const objectKey of uploadedImageObjectKeys) {
      await verifyBoothProductImageUpload({ boothId, objectKey });
    }
  } catch (error) {
    await Promise.all(uploadedImageObjectKeys.map(discardUploadedProductImage));
    if (error instanceof OracleProductImageVerificationError) {
      return {
        error: error.message,
        discardedImageObjectKeys: uploadedImageObjectKeys,
      };
    }
    throw error;
  }

  const removedExistingObjectKeys = (existing?.images ?? [])
    .filter((image) => !retainedExistingIds.includes(image.id))
    .map((image) => image.objectKey);
  const resolvedImages = imageManifest.map((image, sortOrder) => {
    const existingImage =
      "existingId" in image
        ? existingImagesById.get(image.existingId)
        : undefined;
    return {
      objectKey:
        "objectKey" in image ? image.objectKey : existingImage!.objectKey,
      alt: image.alt || existingImage?.alt || name,
      sortOrder,
    };
  });
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
            eyebrow: eyebrow || null,
            shortDescription: shortDescription || null,
            description,
            priceCents,
            status,
            featured: booleanField(formData, "featured"),
            tags,
          },
        });
        const resolvedVariantId = variantId ?? existing?.variants[0]?.id;
        if (resolvedVariantId) {
          const updatedVariant = await transaction.productVariant.updateMany({
            where: { id: resolvedVariantId, productId },
            data: {
              sku,
              label: variantLabel,
              priceCents,
              status: variantStatus,
              stockQuantity,
              fulfillmentNote: fulfillmentNote || null,
            },
          });
          if (!updatedVariant.count) {
            throw new Error("Product variant not found in this product.");
          }
        } else {
          await transaction.productVariant.create({
            data: {
              productId,
              sku,
              label: variantLabel,
              priceCents,
              status: variantStatus,
              stockQuantity,
              fulfillmentNote: fulfillmentNote || null,
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
            eyebrow: eyebrow || null,
            shortDescription: shortDescription || null,
            description,
            priceCents,
            status,
            featured: booleanField(formData, "featured"),
            tags,
            variants: {
              create: {
                sku,
                label: variantLabel,
                priceCents,
                status: variantStatus,
                stockQuantity,
                fulfillmentNote: fulfillmentNote || null,
              },
            },
          },
          select: { id: true },
        });
        nextProductId = created.id;
      }

      if (!nextProductId) throw new Error("Product could not be saved.");
      await transaction.productImage.deleteMany({
        where: { productId: nextProductId },
      });
      for (const image of resolvedImages) {
        await transaction.productImage.create({
          data: { productId: nextProductId, ...image },
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
    if (hasCode(error, "P2002")) {
      return {
        error:
          "That slug or SKU is already used in this booth. Choose a unique value.",
      };
    }
    if (
      error instanceof Error &&
      (error.message === "Product not found in this booth." ||
        error.message === "Product variant not found in this product.")
    ) {
      return {
        error: "That product is no longer available. Refresh and try again.",
      };
    }
    Sentry.captureException(error, {
      tags: {
        "cyfurden.operation": "product.save",
        "cyfurden.product.mode": productId ? "edit" : "create",
        "cyfurden.product.image_upload": uploadedImageObjectKeys.length
          ? "presigned_verified"
          : "none",
      },
      contexts: {
        productSave: {
          hasExistingProduct: Boolean(productId),
          retainedImageCount: retainedExistingIds.length,
          uploadedImageCount: uploadedImageObjectKeys.length,
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

  await Promise.all(
    removedExistingObjectKeys.map(async (objectKey) => {
      const stillReferenced = await db.productImage.findFirst({
        where: { objectKey },
        select: { id: true },
      });
      if (!stillReferenced) await discardUploadedProductImage(objectKey);
    }),
  );

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
    const { session, booth } = await requireBoothRole(boothId, orderRoles);
    const result = await db.$transaction(
      async (transaction) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, boothId },
          select: {
            code: true,
            status: true,
            confirmedAt: true,
            confirmedById: true,
            items: {
              select: {
                id: true,
                productVariantId: true,
                quantity: true,
                inventoryDebited: true,
              },
            },
          },
        });

        if (!order) return { kind: "missing" } as const;
        if (order.status === nextStatus) {
          return { kind: "unchanged", code: order.code } as const;
        }
        if (
          !canTransitionOrderStatus(order.status as OrderStatusName, nextStatus)
        ) {
          return {
            kind: "invalid-transition",
            code: order.code,
            currentStatus: order.status,
          } as const;
        }

        const now = new Date();
        const keepsConfirmation =
          nextStatus === "CONFIRMED" || nextStatus === "FULFILLED";
        const updated = await transaction.order.updateMany({
          where: { id: orderId, boothId, status: order.status },
          data: {
            status: nextStatus,
            confirmedAt: keepsConfirmation ? (order.confirmedAt ?? now) : null,
            confirmedById: keepsConfirmation
              ? (order.confirmedById ?? session.user.id)
              : null,
            fulfilledAt: nextStatus === "FULFILLED" ? now : null,
            expiresAt: nextStatus === "EXPIRED" ? now : null,
          },
        });
        if (!updated.count) return { kind: "conflict" } as const;

        let inventoryReleased = false;
        if (releasesInventory(nextStatus)) {
          for (const item of order.items) {
            if (!item.inventoryDebited || !item.productVariantId) continue;
            await transaction.productVariant.updateMany({
              where: {
                id: item.productVariantId,
                stockQuantity: { not: null },
              },
              data: { stockQuantity: { increment: item.quantity } },
            });
            inventoryReleased = true;
          }
          await transaction.orderItem.updateMany({
            where: { orderId, inventoryDebited: true },
            data: { inventoryDebited: false },
          });
        }

        await transaction.auditLog.create({
          data: {
            boothId,
            actorUserId: session.user.id,
            action: `order.${nextStatus.toLocaleLowerCase()}`,
            entityType: "Order",
            entityId: orderId,
            metadata: { manualReview: true, inventoryReleased },
          },
        });
        return { kind: "changed", code: order.code } as const;
      },
      { isolationLevel: "Serializable" },
    );

    if (result.kind === "missing") {
      return {
        status: "error",
        message: "This order was not found in the active booth.",
      };
    }
    if (result.kind === "conflict") {
      return {
        status: "error",
        message:
          "This order changed in another session. Refresh and try again.",
      };
    }
    if (result.kind === "invalid-transition") {
      return {
        status: "error",
        message: `${result.code} cannot move from ${result.currentStatus.toLocaleLowerCase()} to ${nextStatus.toLocaleLowerCase()}. Terminal statuses cannot be reopened.`,
      };
    }

    if (result.kind === "changed") {
      revalidatePath(`/manage/${boothId}/orders`);
      revalidatePath(`/s/${booth.slug}`);
    }
    const label = nextStatus.toLocaleLowerCase().replaceAll("_", " ");
    return {
      status: "success",
      message:
        result.kind === "changed"
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

export async function removeTeamMemberAction(
  _previousState: TeamMutationState,
  formData: FormData,
): Promise<TeamMutationState> {
  const boothId = requiredText(formData, "boothId");
  const membershipId = requiredText(formData, "membershipId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);

  let result: TeamMutationState;
  try {
    result = await db.$transaction(async (transaction) => {
      const membership = await transaction.boothMembership.findFirst({
        where: { id: membershipId, boothId },
      });
      if (!membership) return { error: "This member could not be found." };
      if (membership.role === "OWNER") {
        return { error: "The booth owner cannot be removed." };
      }

      await transaction.boothMembership.delete({ where: { id: membershipId } });
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: "team.member_removed",
          entityType: "BoothMembership",
          entityId: membershipId,
          metadata: { userId: membership.userId, role: membership.role },
        },
      });
      return { success: "Member removed from this booth." };
    });
  } catch (error) {
    console.error("Failed to remove team member", error);
    return { error: "Member could not be removed. Try again." };
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
