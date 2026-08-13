"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  requireActiveBoothRole as requireBoothRole,
  requireUser,
} from "@/lib/authorization";
import { db } from "@/lib/db";
import { compileGachaDocument } from "@/lib/gacha-document";
import { parseGachaRatesInput } from "@/lib/gacha-rates";
import { parseBilingual } from "@/lib/i18n";
import { localizeGachaCompilationError } from "@/lib/i18n/gacha-errors";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import {
  getWorkspaceStrings,
  type WorkspaceCatalogue,
} from "@/lib/i18n/workspace";
import { saveOrderShipment, transitionOrderStatus } from "@/lib/order-admin";
import { parseEventDateRange } from "@/lib/order-events";
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
  isValidProductSku,
  MAX_PRODUCT_PRICE_VND,
  normalizeProductSku,
  parseWholeVndPrice,
} from "@/lib/product-fields";
import { synchronizeProductInventoryStatus } from "@/lib/product-inventory";
import {
  MAX_PRODUCT_VARIANTS,
  MAX_STOCK_QUANTITY,
  parseProductVariantManifest,
  ProductVariantScopeError,
  synchronizeProductVariants,
} from "@/lib/product-variants";
import { MAX_PROMOTION_QUANTITY } from "@/lib/quantity-promotions";
import { requireBoothServiceAccess } from "@/lib/platform-targets";
import {
  acceptTeamInvitation,
  createTeamInvitation,
  removeTeamMember,
  revokeTeamInvitation,
  updateTeamMemberAccess,
} from "@/lib/team-access";
import {
  createDefaultStorefrontDocument,
  readStorefrontDocument,
  storefrontDocumentSchema,
  storefrontSectionIds,
} from "@/lib/storefront-document";
import { findVietQrBank } from "@/lib/vietqr-banks";
import {
  boothSocialLinksSchema,
  compactBoothSocialLinks,
  isBoothLogoObjectKey,
  socialPlatforms,
} from "@/lib/shop-settings";
import { validateVietQrBeneficiary } from "@/lib/vietqr";
import { defaultPaymentContent } from "@/lib/system-content";

const editorRoles = ["OWNER", "ADMIN"] as const;
const orderRoles = ["OWNER", "ADMIN", "STAFF"] as const;

const readActionStrings = async () =>
  getWorkspaceStrings(await readLocaleCookie()).actions;

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

const paymentDraftSchema = (strings: WorkspaceCatalogue["actions"]) =>
  z
    .object({
      bankName: z.string().trim().min(1).max(120),
      bankCode: z.string().regex(/^\d{6}$/),
      accountName: z.string().trim().max(120),
      accountNumber: z.string().trim().max(80),
      paymentLabel: z.string().trim().min(2).max(80),
      transferReferenceTemplate: z.string().trim().max(120),
      instructions: z.string().trim().max(2_000),
      disclaimer: z.string().trim().max(1_000),
    })
    .superRefine((payment, context) => {
      if (!payment.accountName || !payment.accountNumber) {
        context.addIssue({
          code: "custom",
          path: ["bankCode"],
          message: strings.paymentRequired,
        });
        return;
      }
      try {
        validateVietQrBeneficiary(payment);
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["accountNumber"],
          message:
            error instanceof Error ? error.message : strings.beneficiaryInvalid,
        });
      }
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

const promotionSchema = (strings: WorkspaceCatalogue["actions"]) =>
  z
    .object({
      promotionId: z.string().trim().min(1).max(100).nullable(),
      name: z.string().trim().min(2).max(160),
      buyQuantity: z.number().int().min(1).max(MAX_PROMOTION_QUANTITY),
      rewardQuantity: z.number().int().min(1).max(MAX_PROMOTION_QUANTITY),
      active: z.boolean(),
      repeatable: z.boolean(),
      buyProductIds: z.array(z.string().trim().min(1).max(100)).max(100),
      rewardProductIds: z.array(z.string().trim().min(1).max(100)).max(100),
    })
    .superRefine((promotion, context) => {
      if (!promotion.active) return;
      if (!promotion.buyProductIds.length) {
        context.addIssue({
          code: "custom",
          path: ["buyProductIds"],
          message: strings.promotionQualifying,
        });
      }
      if (!promotion.rewardProductIds.length) {
        context.addIssue({
          code: "custom",
          path: ["rewardProductIds"],
          message: strings.promotionReward,
        });
      }
    });

export type StorefrontSaveState = { error: string | null };
export type BoothSettingsSaveState = { error: string | null };

export async function saveBoothSettingsAction(
  _previousState: BoothSettingsSaveState,
  formData: FormData,
): Promise<BoothSettingsSaveState> {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  const boothNameResult = z
    .string()
    .trim()
    .min(2, strings.boothNameMin)
    .max(80, strings.boothNameMax)
    .safeParse(requiredText(formData, "boothName"));
  if (!boothNameResult.success) {
    return { error: boothNameResult.error.issues[0]?.message };
  }

  const selectedBank = findVietQrBank(requiredText(formData, "bankCode"));
  if (!selectedBank) {
    return {
      error: strings.supportedBank,
    };
  }
  const paymentResult = paymentDraftSchema(strings).safeParse({
    bankName: selectedBank.shortName,
    bankCode: selectedBank.bin,
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
      error: paymentResult.error.issues[0]?.message ?? strings.paymentFields,
    };
  }

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
      error: socialResult.error.issues[0]?.message ?? strings.socialLinks,
    };
  }

  const logoObjectKey = requiredText(formData, "logoObjectKey");
  if (logoObjectKey && !isBoothLogoObjectKey(boothId, logoObjectKey)) {
    return {
      error: strings.logoScope,
    };
  }
  if (logoObjectKey && logoObjectKey !== booth.logoObjectKey) {
    try {
      await verifyBoothLogoUpload({ boothId, objectKey: logoObjectKey });
    } catch (error) {
      if (error instanceof OracleLogoVerificationError) {
        return { error: strings.logoUpload };
      }
      throw error;
    }
  }

  const [existingPayment, existingStorefront] = await Promise.all([
    db.boothPaymentInstruction.findUnique({
      where: { boothId },
      select: { qrObjectKey: true },
    }),
    db.storefrontConfig.findUnique({
      where: { boothId },
      select: { draftDocument: true },
    }),
  ]);
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
        return { error: strings.qrUpload };
      }
      throw error;
    }
  }

  const currentDocument = existingStorefront
    ? readStorefrontDocument(existingStorefront.draftDocument, booth.name)
    : createDefaultStorefrontDocument(booth.name);
  const nextDocument = {
    ...currentDocument,
    name: boothNameResult.data,
  };
  const payment = paymentResult.data;

  try {
    await db.$transaction(async (transaction) => {
      await requireBoothServiceAccess(boothId, "MUTATION", transaction);
      await transaction.storefrontConfig.upsert({
        where: { boothId },
        create: {
          boothId,
          draftDocument: nextDocument,
          updatedById: session.user.id,
        },
        update: {
          draftDocument: nextDocument,
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
            payment.transferReferenceTemplate || "{code}",
          instructions: payment.instructions,
          disclaimer: payment.disclaimer || defaultPaymentContent.disclaimer,
        },
        update: {
          bankName: payment.bankName,
          bankCode: payment.bankCode || null,
          accountName: payment.accountName,
          accountNumber: payment.accountNumber,
          paymentLabel: payment.paymentLabel,
          qrObjectKey,
          transferReferenceTemplate:
            payment.transferReferenceTemplate || "{code}",
          instructions: payment.instructions,
          disclaimer: payment.disclaimer || defaultPaymentContent.disclaimer,
        },
      });
      await transaction.booth.update({
        where: { id: boothId },
        data: {
          name: boothNameResult.data,
          logoObjectKey: logoObjectKey || null,
          socialLinks: compactBoothSocialLinks(socialResult.data),
        },
      });
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: "booth.settings_updated",
          entityType: "Booth",
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

  revalidatePath("/dashboard");
  revalidatePath(`/manage/${boothId}`, "layout");
  revalidatePath(`/manage/${boothId}/settings`);
  revalidatePath(`/manage/${boothId}/storefront`);
  redirect(`/manage/${boothId}/settings?saved=1`);
}

export async function saveStorefrontAction(
  _previousState: StorefrontSaveState,
  formData: FormData,
): Promise<StorefrontSaveState> {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  const visibleSections = storefrontSectionIds.filter((section) =>
    booleanField(formData, `visible-${section}`),
  );
  let sectionOrder: unknown = storefrontSectionIds;
  try {
    sectionOrder = JSON.parse(requiredText(formData, "sectionOrder"));
  } catch {
    sectionOrder = storefrontSectionIds;
  }
  let featuredProductIds: unknown = null;
  const featuredProductIdsValue = requiredText(formData, "featuredProductIds");
  if (featuredProductIdsValue) {
    try {
      featuredProductIds = JSON.parse(featuredProductIdsValue);
    } catch {
      return {
        error: strings.featuredSelection,
      };
    }
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
    featuredProductIds,
  });
  if (!documentResult.success) {
    return {
      error:
        documentResult.error.issues[0]?.message ?? strings.storefrontFields,
    };
  }
  const document = documentResult.data;
  if (document.featuredProductIds?.length) {
    const featuredProductCount = await db.product.count({
      where: {
        boothId,
        id: { in: document.featuredProductIds },
        status: { in: ["LIVE", "SOLD_OUT"] },
      },
    });
    if (featuredProductCount !== document.featuredProductIds.length) {
      return {
        error: strings.featuredUnavailable,
      };
    }
  }
  const selectedBank = findVietQrBank(requiredText(formData, "bankCode"));
  if (!selectedBank) {
    return {
      error: strings.supportedBank,
    };
  }
  const paymentResult = paymentDraftSchema(strings).safeParse({
    bankName: selectedBank.shortName,
    bankCode: selectedBank.bin,
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
      error: paymentResult.error.issues[0]?.message ?? strings.paymentFields,
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
      error: socialResult.error.issues[0]?.message ?? strings.socialLinks,
    };
  }
  const logoObjectKey = requiredText(formData, "logoObjectKey");
  if (logoObjectKey && !isBoothLogoObjectKey(boothId, logoObjectKey)) {
    return {
      error: strings.logoScope,
    };
  }
  if (logoObjectKey && logoObjectKey !== booth.logoObjectKey) {
    try {
      await verifyBoothLogoUpload({ boothId, objectKey: logoObjectKey });
    } catch (error) {
      if (error instanceof OracleLogoVerificationError) {
        return { error: strings.logoUpload };
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
        return { error: strings.qrUpload };
      }
      throw error;
    }
  }

  try {
    await db.$transaction(async (transaction) => {
      await requireBoothServiceAccess(boothId, "MUTATION", transaction);
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
            payment.transferReferenceTemplate || "{code}",
          instructions: payment.instructions,
          disclaimer: payment.disclaimer || defaultPaymentContent.disclaimer,
        },
        update: {
          bankName: payment.bankName,
          bankCode: payment.bankCode || null,
          accountName: payment.accountName,
          accountNumber: payment.accountNumber,
          paymentLabel: payment.paymentLabel,
          qrObjectKey,
          transferReferenceTemplate:
            payment.transferReferenceTemplate || "{code}",
          instructions: payment.instructions,
          disclaimer: payment.disclaimer || defaultPaymentContent.disclaimer,
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
  const strings = await readActionStrings();
  const config = await db.storefrontConfig.findUnique({ where: { boothId } });
  if (!config) {
    throw new Error(strings.saveDraftBeforePublish);
  }

  const document = storefrontDocumentSchema.parse(config.draftDocument);
  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    await transaction.storefrontConfig.update({
      where: { boothId },
      data: {
        publishedDocument: document,
        publishedAt: new Date(),
        updatedById: session.user.id,
      },
    });
    await transaction.booth.update({
      where: { id: boothId },
      data: { name: document.name, status: "PUBLISHED" },
    });
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "storefront.published",
        entityType: "StorefrontConfig",
        entityId: boothId,
      },
    });
  });

  revalidatePath(`/manage/${boothId}/storefront`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/storefront?published=1`);
}

const productStatusSchema = z.enum(["DRAFT", "LIVE", "SOLD_OUT", "HIDDEN"]);

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
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  const name = requiredText(formData, "name");
  const slug = slugify(requiredText(formData, "slug") || name);
  const rawSku = requiredText(formData, "sku");
  const sku = rawSku ? normalizeProductSku(rawSku) : "";
  const rawPrice = requiredText(formData, "priceVnd");
  const priceVnd = parseWholeVndPrice(rawPrice);
  const description = requiredText(formData, "description");
  const eyebrow = requiredText(formData, "eyebrow");
  const shortDescription = requiredText(formData, "shortDescription");
  if (
    name.length < 2 ||
    name.length > 120 ||
    !slug ||
    (sku && !isValidProductSku(sku)) ||
    priceVnd === null
  ) {
    return {
      error: strings.productCoreFields(
        MAX_PRODUCT_PRICE_VND.toLocaleString("en-US"),
      ),
    };
  }
  if (
    description.length < 1 ||
    description.length > 5_000 ||
    eyebrow.length > 80 ||
    shortDescription.length > 240
  ) {
    return {
      error: strings.productCopyLimits,
    };
  }

  let rawVariantManifest: unknown;
  try {
    rawVariantManifest = JSON.parse(requiredText(formData, "variantManifest"));
  } catch {
    return { error: strings.productVariantsInvalid };
  }
  const variantManifestResult = parseProductVariantManifest(rawVariantManifest);
  if (!variantManifestResult.success) {
    const error = variantManifestResult.error;
    if (error === "count") {
      return { error: strings.productVariantsCount(MAX_PRODUCT_VARIANTS) };
    }
    if (error === "sku") {
      return { error: strings.productVariantSku };
    }
    if (error === "duplicate-sku") {
      return { error: strings.productVariantSkuDuplicate };
    }
    if (error === "label") {
      return { error: strings.productVariantLabel };
    }
    if (error === "price") {
      return {
        error: strings.productVariantPrice(
          MAX_PRODUCT_PRICE_VND.toLocaleString("en-US"),
        ),
      };
    }
    if (error === "stock") {
      return {
        error: strings.productStock(MAX_STOCK_QUANTITY.toLocaleString("en-US")),
      };
    }
    if (error === "note") {
      return { error: strings.productVariantNote };
    }
    return { error: strings.productVariantsInvalid };
  }
  const variantManifest = variantManifestResult.data;

  let rawImageManifest: unknown;
  try {
    rawImageManifest = JSON.parse(requiredText(formData, "imageManifest"));
  } catch {
    return {
      error: strings.productImagesInvalid,
    };
  }
  const imageManifestResult =
    productImageManifestSchema.safeParse(rawImageManifest);
  if (!imageManifestResult.success) {
    return {
      error: strings.productImagesLimit(PRODUCT_IMAGE_MAX_COUNT),
    };
  }
  const imageManifest = imageManifestResult.data;
  const manifestIdentifiers = imageManifest.map((image) =>
    "existingId" in image
      ? `existing:${image.existingId}`
      : `new:${image.objectKey}`,
  );
  if (new Set(manifestIdentifiers).size !== manifestIdentifiers.length) {
    return { error: strings.productImagesDuplicate };
  }

  const priceCents = BigInt(priceVnd) * BigInt(100);
  const statusResult = productStatusSchema.safeParse(
    requiredText(formData, "status"),
  );
  if (!statusResult.success) return { error: strings.productStatuses };
  const status = statusResult.data;
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
        },
      })
    : null;
  if (productId && !existing) {
    return {
      error: strings.productUnavailable,
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
      error: strings.productExistingImageUnavailable,
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
      error: strings.productImageScope,
    };
  }
  if (uploadedImageObjectKeys.length) {
    const attachedUpload = await db.productImage.findFirst({
      where: { objectKey: { in: uploadedImageObjectKeys } },
      select: { id: true },
    });
    if (attachedUpload) {
      return {
        error: strings.productImageAttached,
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
        error: strings.productImageVerification,
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
    savedProductId = await db.$transaction(
      async (transaction) => {
        await requireBoothServiceAccess(boothId, "MUTATION", transaction);
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
              sku: sku || null,
              eyebrow: eyebrow || null,
              shortDescription: shortDescription || null,
              description,
              priceCents,
              status,
              featured: booleanField(formData, "featured"),
              tags,
            },
          });
        } else {
          const created = await transaction.product.create({
            data: {
              boothId,
              name,
              slug,
              sku: sku || null,
              eyebrow: eyebrow || null,
              shortDescription: shortDescription || null,
              description,
              priceCents,
              status,
              featured: booleanField(formData, "featured"),
              tags,
            },
            select: { id: true },
          });
          nextProductId = created.id;
        }

        if (!nextProductId) throw new Error("Product could not be saved.");
        const variantSummary = await synchronizeProductVariants(
          transaction,
          nextProductId,
          variantManifest,
        );
        await synchronizeProductInventoryStatus(transaction, [nextProductId]);
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
            metadata: {
              variants: variantManifest.length,
              ...variantSummary,
            },
          },
        });
        return nextProductId;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (hasCode(error, "P2002")) {
      return {
        error: strings.productUnique,
      };
    }
    if (
      error instanceof ProductVariantScopeError ||
      (error instanceof Error &&
        error.message === "Product not found in this booth.")
    ) {
      return {
        error: strings.productUnavailable,
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
        error: strings.productDatabaseValue,
      };
    }
    return {
      error: strings.productSaveFailed,
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
  const strings = await readActionStrings();
  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    const result = await transaction.product.updateMany({
      where: { id: productId, boothId },
      data: { status: "HIDDEN" },
    });
    if (!result.count) throw new Error(strings.productUnavailable);
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "product.hidden",
        entityType: "Product",
        entityId: productId,
      },
    });
  });
  revalidatePath(`/manage/${boothId}/products`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/products`);
}

export type PromotionSaveState = { error: string | null };

export async function savePromotionAction(
  _previousState: PromotionSaveState,
  formData: FormData,
): Promise<PromotionSaveState> {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  const parsed = promotionSchema(strings).safeParse({
    promotionId: optionalText(formData, "promotionId"),
    name: requiredText(formData, "name"),
    buyQuantity: parseInteger(formData.get("buyQuantity"), 0),
    rewardQuantity: parseInteger(formData.get("rewardQuantity"), 0),
    active: booleanField(formData, "active"),
    repeatable: booleanField(formData, "repeatable"),
    buyProductIds: [...new Set(formData.getAll("buyProductIds").map(String))],
    rewardProductIds: [
      ...new Set(formData.getAll("rewardProductIds").map(String)),
    ],
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? strings.promotionFields,
    };
  }

  const selectedProductIds = [
    ...new Set([...parsed.data.buyProductIds, ...parsed.data.rewardProductIds]),
  ];

  try {
    await db.$transaction(async (transaction) => {
      await requireBoothServiceAccess(boothId, "MUTATION", transaction);
      const [promotion, matchingProductCount] = await Promise.all([
        parsed.data.promotionId
          ? transaction.quantityPromotion.findFirst({
              where: { id: parsed.data.promotionId, boothId },
              select: { id: true },
            })
          : transaction.quantityPromotion.findFirst({
              where: { boothId },
              orderBy: { createdAt: "asc" },
              select: { id: true },
            }),
        selectedProductIds.length
          ? transaction.product.count({
              where: { boothId, id: { in: selectedProductIds } },
            })
          : Promise.resolve(0),
      ]);

      if (matchingProductCount !== selectedProductIds.length) {
        throw new Error("PROMOTION_PRODUCT_SCOPE");
      }
      if (parsed.data.promotionId && !promotion) {
        throw new Error("PROMOTION_NOT_FOUND");
      }

      const savedPromotion = promotion
        ? await transaction.quantityPromotion.update({
            where: { id: promotion.id },
            data: {
              name: parsed.data.name,
              buyQuantity: parsed.data.buyQuantity,
              rewardQuantity: parsed.data.rewardQuantity,
              active: parsed.data.active,
              repeatable: parsed.data.repeatable,
            },
            select: { id: true },
          })
        : await transaction.quantityPromotion.create({
            data: {
              boothId,
              name: parsed.data.name,
              buyQuantity: parsed.data.buyQuantity,
              rewardQuantity: parsed.data.rewardQuantity,
              active: parsed.data.active,
              repeatable: parsed.data.repeatable,
            },
            select: { id: true },
          });

      await transaction.promotionProduct.deleteMany({
        where: { promotionId: savedPromotion.id },
      });
      const links = [
        ...parsed.data.buyProductIds.map((productId) => ({
          promotionId: savedPromotion.id,
          productId,
          role: "BUY" as const,
        })),
        ...parsed.data.rewardProductIds.map((productId) => ({
          promotionId: savedPromotion.id,
          productId,
          role: "REWARD" as const,
        })),
      ];
      if (links.length) {
        await transaction.promotionProduct.createMany({ data: links });
      }
      await transaction.auditLog.create({
        data: {
          boothId,
          actorUserId: session.user.id,
          action: "promotion.saved",
          entityType: "QuantityPromotion",
          entityId: savedPromotion.id,
          metadata: {
            active: parsed.data.active,
            repeatable: parsed.data.repeatable,
            buyQuantity: parsed.data.buyQuantity,
            rewardQuantity: parsed.data.rewardQuantity,
            buyProductCount: parsed.data.buyProductIds.length,
            rewardProductCount: parsed.data.rewardProductIds.length,
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "PROMOTION_PRODUCT_SCOPE" ||
        error.message === "PROMOTION_NOT_FOUND")
    ) {
      return {
        error: strings.promotionScope,
      };
    }
    Sentry.captureException(error, {
      tags: { "cyfurden.operation": "promotion.save" },
    });
    console.error("Failed to save quantity promotion", error);
    return { error: strings.promotionSaveFailed };
  }

  revalidatePath(`/manage/${boothId}/promotions`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/promotions?saved=1`);
}

export type OrderStatusActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type OrderShipmentActionState = OrderStatusActionState;

export async function saveOrderShipmentAction(
  _previousState: OrderShipmentActionState,
  formData: FormData,
): Promise<OrderShipmentActionState> {
  const strings = await readActionStrings();
  const boothId = requiredText(formData, "boothId");
  const orderId = requiredText(formData, "orderId");
  if (!boothId || !orderId) {
    return { status: "error", message: strings.shipmentInvalid };
  }

  try {
    const { session } = await requireBoothRole(boothId, editorRoles);
    const result = await saveOrderShipment({
      boothId,
      orderId,
      actorUserId: session.user.id,
      shipment: {
        carrier: requiredText(formData, "carrier"),
        trackingNumber: requiredText(formData, "trackingNumber"),
        trackingUrl: requiredText(formData, "trackingUrl"),
      },
    });

    if (result.kind === "invalid") {
      return { status: "error", message: strings.shipmentInvalid };
    }
    if (result.kind === "not-shipping") {
      return { status: "error", message: strings.shipmentPickupOnly };
    }
    if (result.kind === "missing") {
      return { status: "error", message: strings.orderMissing };
    }
    if (result.kind === "forbidden") {
      return { status: "error", message: strings.shipmentForbidden };
    }
    if (result.kind === "conflict") {
      return { status: "error", message: strings.orderConflict };
    }

    revalidatePath(`/manage/${boothId}/shipping`);
    revalidatePath(`/manage/${boothId}/orders/${orderId}`);
    return { status: "success", message: strings.shipmentSaved };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { "cyfurden.operation": "order.shipment.save" },
    });
    console.error("Order shipment save failed", error);
    return { status: "error", message: strings.shipmentSaveFailed };
  }
}

export type OrderEventActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const orderEventSchema = z.object({
  boothId: z.string().trim().min(1).max(100),
  eventId: z.string().trim().max(100),
  name: z.string().trim().min(2).max(100),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
});

export async function saveOrderEventAction(
  _previousState: OrderEventActionState,
  formData: FormData,
): Promise<OrderEventActionState> {
  const strings = await readActionStrings();
  const parsed = orderEventSchema.safeParse({
    boothId: requiredText(formData, "boothId"),
    eventId: requiredText(formData, "eventId"),
    name: requiredText(formData, "name"),
    startDate: requiredText(formData, "startDate"),
    endDate: requiredText(formData, "endDate"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: strings.eventFields,
    };
  }

  const range = parseEventDateRange(parsed.data.startDate, parsed.data.endDate);
  if (!range) {
    return {
      status: "error",
      message: strings.eventDateOrder,
    };
  }

  const { boothId, eventId, name } = parsed.data;
  try {
    const { session } = await requireBoothRole(boothId, editorRoles);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await db.$transaction(
          async (transaction) => {
            await requireBoothServiceAccess(boothId, "MUTATION", transaction);
            if (eventId) {
              const existing = await transaction.event.findFirst({
                where: { id: eventId, boothId },
                select: { id: true },
              });
              if (!existing) return { kind: "missing" as const };
            }

            const overlap = await transaction.event.findFirst({
              where: {
                boothId,
                ...(eventId ? { id: { not: eventId } } : {}),
                startsAt: { lt: range.endsAt },
                endsAt: { gt: range.startsAt },
              },
              orderBy: [{ startsAt: "asc" }, { id: "asc" }],
              select: { name: true },
            });
            if (overlap) {
              return {
                kind: "overlap" as const,
                eventName: overlap.name,
              };
            }

            const saved = eventId
              ? await transaction.event.update({
                  where: { id_boothId: { id: eventId, boothId } },
                  data: { name, ...range },
                  select: { id: true },
                })
              : await transaction.event.create({
                  data: { boothId, name, ...range },
                  select: { id: true },
                });

            await transaction.auditLog.create({
              data: {
                boothId,
                actorUserId: session.user.id,
                action: eventId ? "order_event.updated" : "order_event.created",
                entityType: "Event",
                entityId: saved.id,
                metadata: {
                  name,
                  startsAt: range.startsAt.toISOString(),
                  endsAt: range.endsAt.toISOString(),
                },
              },
            });
            return { kind: "saved" as const };
          },
          { isolationLevel: "Serializable" },
        );

        if (result.kind === "missing") {
          return {
            status: "error",
            message: strings.eventMissing,
          };
        }
        if (result.kind === "overlap") {
          return {
            status: "error",
            message: strings.eventOverlap(result.eventName),
          };
        }

        revalidatePath(`/manage/${boothId}/orders`);
        return {
          status: "success",
          message: eventId ? strings.eventUpdated : strings.eventCreated,
        };
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        if (code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { "cyfurden.operation": "order_event.save" },
    });
    console.error("Order event save failed", error);
  }

  return {
    status: "error",
    message: strings.eventSaveFailed,
  };
}

export async function updateOrderStatusAction(
  _previousState: OrderStatusActionState,
  formData: FormData,
): Promise<OrderStatusActionState> {
  const locale = await readLocaleCookie();
  const catalogue = getWorkspaceStrings(locale);
  const strings = catalogue.actions;
  const boothId = requiredText(formData, "boothId");
  const orderId = requiredText(formData, "orderId");
  const parsedStatus = z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED", "FULFILLED"])
    .safeParse(requiredText(formData, "status"));

  if (!boothId || !orderId || !parsedStatus.success) {
    return {
      status: "error",
      message: strings.orderStatusInvalid,
    };
  }

  try {
    const nextStatus = parsedStatus.data;
    const { session, booth } = await requireBoothRole(boothId, orderRoles);
    const result = await transitionOrderStatus({
      boothId,
      orderId,
      actorUserId: session.user.id,
      nextStatus,
    });

    if (result.kind === "missing") {
      return {
        status: "error",
        message: strings.orderMissing,
      };
    }
    if (result.kind === "conflict") {
      return {
        status: "error",
        message: strings.orderConflict,
      };
    }
    if (result.kind === "invalid-transition") {
      return {
        status: "error",
        message: strings.orderTransition(
          result.code,
          catalogue.common.orderStatusLabels[result.currentStatus],
          catalogue.common.orderStatusLabels[nextStatus],
        ),
      };
    }

    if (result.kind === "changed") {
      revalidatePath(`/manage/${boothId}/orders`);
      revalidatePath(`/manage/${boothId}/orders/${orderId}`);
      revalidatePath(`/manage/${boothId}/payments`);
      revalidatePath(`/manage/${boothId}/shipping`);
      revalidatePath(`/s/${booth.slug}`);
    }
    const label = catalogue.common.orderStatusLabels[nextStatus];
    return {
      status: "success",
      message:
        result.kind === "changed"
          ? strings.orderChanged(result.code, label)
          : strings.orderUnchanged(result.code, label),
    };
  } catch (error) {
    console.error("Order status update failed", error);
    return {
      status: "error",
      message: strings.orderSaveFailed,
    };
  }
}

export async function saveGachaAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const { session } = await requireBoothRole(boothId, editorRoles);
  const rates = parseGachaRatesInput({
    common: formData.get("rateCommon"),
    rare: formData.get("rateRare"),
    epic: formData.get("rateEpic"),
    legendary: formData.get("rateLegendary"),
  });
  const guaranteedAt = Math.min(
    500,
    Math.max(1, parseInteger(formData.get("guaranteedAt"), 50)),
  );
  const guaranteedRarity = z
    .enum(["RARE", "EPIC", "LEGENDARY"])
    .parse(requiredText(formData, "guaranteedRarity"));
  const gameTheme = z
    .enum(["anemo", "ember", "starlight"])
    .parse(requiredText(formData, "gameTheme"));
  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    await transaction.gachaConfig.upsert({
      where: { boothId },
      create: {
        boothId,
        enabled: booleanField(formData, "enabled"),
        title: requiredText(formData, "title"),
        introduction: requiredText(formData, "introduction"),
        gameTheme,
        pityEnabled: booleanField(formData, "pityEnabled"),
        guaranteedAt,
        guaranteedRarity,
        rates,
      },
      update: {
        enabled: booleanField(formData, "enabled"),
        title: requiredText(formData, "title"),
        introduction: requiredText(formData, "introduction"),
        gameTheme,
        pityEnabled: booleanField(formData, "pityEnabled"),
        guaranteedAt,
        guaranteedRarity,
        rates,
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
  const { session } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  const bannerId = optionalText(formData, "bannerId");
  const startDate = requiredText(formData, "startDate");
  const endDate = requiredText(formData, "endDate");
  const dateRange =
    !startDate && !endDate ? null : parseEventDateRange(startDate, endDate);
  if ((startDate || endDate) && !dateRange) {
    throw new Error(strings.gachaDates);
  }
  const data = {
    title: requiredText(formData, "bannerTitle"),
    copy: requiredText(formData, "bannerCopy"),
    type: z
      .enum(["CHARACTER", "WEAPON", "COLLECTION"])
      .parse(requiredText(formData, "bannerType")),
    theme: z
      .enum(["anemo", "ember", "starlight"])
      .parse(requiredText(formData, "bannerTheme")),
    featuredCount: Math.min(
      10,
      Math.max(1, parseInteger(formData.get("featuredCount"), 3)),
    ),
    startsAt: dateRange?.startsAt ?? null,
    endsAt: dateRange?.endsAt ?? null,
    active: booleanField(formData, "bannerActive"),
  } as const;

  let savedBannerId = bannerId;
  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    if (bannerId) {
      const result = await transaction.gachaBanner.updateMany({
        where: { id: bannerId, boothId },
        data,
      });
      if (!result.count) throw new Error(strings.gachaBannerMissing);
    } else {
      const sortOrder = await transaction.gachaBanner.count({
        where: { boothId },
      });
      const created = await transaction.gachaBanner.create({
        data: { boothId, ...data, sortOrder },
      });
      savedBannerId = created.id;
    }
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "gacha.banner_saved",
        entityType: "GachaBanner",
        entityId: savedBannerId || boothId,
        metadata: { freeOnly: true },
      },
    });
  });

  revalidatePath(`/manage/${boothId}/gacha`);
  redirect(`/manage/${boothId}/gacha?banner=${savedBannerId}&saved=1`);
}

export async function saveGachaPoolAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const bannerId = requiredText(formData, "bannerId");
  const { session } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  const banner = await db.gachaBanner.findFirst({
    where: { id: bannerId, boothId },
  });
  if (!banner) throw new Error(strings.gachaBannerMissing);

  const requestedVariantIds = [
    ...new Set(formData.getAll("variantId").map(String).filter(Boolean)),
  ];
  const variants = await db.productVariant.findMany({
    where: {
      id: { in: requestedVariantIds },
      product: { boothId },
    },
    include: { product: true },
  });
  if (variants.length !== requestedVariantIds.length) {
    throw new Error(strings.gachaVariantScope);
  }
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const poolEntries = requestedVariantIds.map((variantId, index) => {
    const variant = variantMap.get(variantId);
    if (!variant) throw new Error(strings.gachaVariantMissing);
    return {
      bannerId,
      productVariantId: variant.id,
      displayName: `${variant.product.name} · ${variant.label}`,
      rarity: z
        .enum(["COMMON", "RARE", "EPIC", "LEGENDARY"])
        .parse(requiredText(formData, `rarity:${variant.id}`)),
      weight: Math.min(
        1_000,
        Math.max(1, parseInteger(formData.get(`weight:${variant.id}`), 1)),
      ),
      featured: booleanField(formData, `featured:${variant.id}`),
      sortOrder: index,
    };
  });

  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    await transaction.gachaPoolEntry.deleteMany({ where: { bannerId } });
    if (poolEntries.length) {
      await transaction.gachaPoolEntry.createMany({
        data: poolEntries,
      });
    }
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "gacha.pool_saved",
        entityType: "GachaBanner",
        entityId: bannerId,
        metadata: { entries: poolEntries.length, freeOnly: true },
      },
    });
  });
  revalidatePath(`/manage/${boothId}/gacha`);
  redirect(`/manage/${boothId}/gacha?banner=${bannerId}&poolSaved=1`);
}

export async function publishGachaAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const locale = await readLocaleCookie();
  const catalogue = getWorkspaceStrings(locale);
  const publishedAt = new Date();

  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    const [config, banners] = await Promise.all([
      transaction.gachaConfig.findUnique({ where: { boothId } }),
      transaction.gachaBanner.findMany({
        where: { boothId },
        include: {
          pool: {
            include: { productVariant: { include: { product: true } } },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const compilation = compileGachaDocument({
      config,
      banners,
      publishedAt,
    });
    if (!compilation.success) {
      throw new Error(
        compilation.errors
          .map((error) =>
            localizeGachaCompilationError(error, catalogue.gacha, (value) =>
              parseBilingual(value, locale),
            ),
          )
          .join(" "),
      );
    }
    await transaction.gachaConfig.update({
      where: { boothId },
      data: {
        publishedDocument: compilation.document,
        publishedAt,
      },
    });
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "gacha.published",
        entityType: "GachaConfig",
        entityId: config?.id ?? boothId,
        metadata: {
          banners: compilation.document.banners.length,
          resultContract: compilation.document.resultContract,
          freeOnly: true,
        },
      },
    });
  });

  revalidatePath(`/manage/${boothId}/gacha`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/gacha?published=1`);
}

export async function unpublishGachaAction(formData: FormData) {
  const boothId = requiredText(formData, "boothId");
  const { session, booth } = await requireBoothRole(boothId, editorRoles);
  const strings = await readActionStrings();
  await db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(boothId, "MUTATION", transaction);
    const config = await transaction.gachaConfig.findUnique({
      where: { boothId },
      select: { id: true },
    });
    if (!config) throw new Error(strings.gachaSetupMissing);
    await transaction.gachaConfig.update({
      where: { boothId },
      data: { publishedDocument: Prisma.DbNull, publishedAt: null },
    });
    await transaction.auditLog.create({
      data: {
        boothId,
        actorUserId: session.user.id,
        action: "gacha.unpublished",
        entityType: "GachaConfig",
        entityId: config.id,
        metadata: { freeOnly: true },
      },
    });
  });
  revalidatePath(`/manage/${boothId}/gacha`);
  revalidatePath(`/s/${booth.slug}`);
  redirect(`/manage/${boothId}/gacha?unpublished=1`);
}

const teamInviteSchema = (strings: WorkspaceCatalogue["actions"]) =>
  z.object({
    email: z
      .email(strings.invitationEmail)
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

export type InvitationAcceptanceState = TeamMutationState;

export async function inviteTeamMemberAction(
  _previousState: TeamInviteState,
  formData: FormData,
): Promise<TeamInviteState> {
  const boothId = requiredText(formData, "boothId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const strings = await readActionStrings();
  const parsed = teamInviteSchema(strings).safeParse({
    email: requiredText(formData, "email"),
    role: requiredText(formData, "role"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? strings.invitationCheck,
    };
  }

  let result: Awaited<ReturnType<typeof createTeamInvitation>>;
  try {
    result = await createTeamInvitation({
      boothId,
      email: parsed.data.email,
      role: parsed.data.role,
      actorUserId: session.user.id,
    });
  } catch (error) {
    console.error("Failed to create team invitation", error);
    return {
      error: strings.invitationCreateFailed,
    };
  }

  if (result.kind === "already-member") {
    return { error: strings.invitationAlreadyMember };
  }
  if (result.kind === "already-invited") {
    return { error: strings.invitationAlreadyActive };
  }
  if (result.kind === "capacity") {
    return {
      error: strings.invitationCapacity,
    };
  }

  revalidatePath(`/manage/${boothId}/team`);
  return {
    invitationPath: `/invitations/${result.token}`,
    invitedEmail: result.email,
  };
}

export async function revokeTeamInvitationAction(
  _previousState: TeamMutationState,
  formData: FormData,
): Promise<TeamMutationState> {
  const boothId = requiredText(formData, "boothId");
  const invitationId = requiredText(formData, "invitationId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const strings = await readActionStrings();
  let revoked: boolean;
  try {
    revoked = await revokeTeamInvitation({
      boothId,
      invitationId,
      actorUserId: session.user.id,
    });
  } catch (error) {
    console.error("Failed to revoke team invitation", error);
    return { error: strings.invitationRevokeFailed };
  }
  if (!revoked) return { error: strings.invitationInactive };
  revalidatePath(`/manage/${boothId}/team`);
  return { success: strings.invitationRevoked };
}

export async function updateTeamMemberAction(
  _previousState: TeamMutationState,
  formData: FormData,
): Promise<TeamMutationState> {
  const boothId = requiredText(formData, "boothId");
  const membershipId = requiredText(formData, "membershipId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const strings = await readActionStrings();
  const parsed = teamMemberUpdateSchema.safeParse({
    role: requiredText(formData, "role"),
    status: requiredText(formData, "status"),
  });
  if (!parsed.success) return { error: strings.memberAccessInvalid };

  let result: Awaited<ReturnType<typeof updateTeamMemberAccess>>;
  try {
    result = await updateTeamMemberAccess({
      boothId,
      membershipId,
      actorUserId: session.user.id,
      role: parsed.data.role,
      status: parsed.data.status,
    });
  } catch (error) {
    console.error("Failed to update team member", error);
    return { error: strings.memberUpdateFailed };
  }

  if (result.kind === "missing") {
    return { error: strings.memberMissing };
  }
  if (result.kind === "owner-protected") {
    return { error: strings.memberOwnerChange };
  }
  if (result.kind === "capacity") {
    return { error: strings.memberCapacity };
  }
  revalidatePath(`/manage/${boothId}/team`);
  return { success: strings.memberUpdated };
}

export async function removeTeamMemberAction(
  _previousState: TeamMutationState,
  formData: FormData,
): Promise<TeamMutationState> {
  const boothId = requiredText(formData, "boothId");
  const membershipId = requiredText(formData, "membershipId");
  const { session } = await requireBoothRole(boothId, ["OWNER"]);
  const strings = await readActionStrings();

  let result: Awaited<ReturnType<typeof removeTeamMember>>;
  try {
    result = await removeTeamMember({
      boothId,
      membershipId,
      actorUserId: session.user.id,
    });
  } catch (error) {
    console.error("Failed to remove team member", error);
    return { error: strings.memberRemoveFailed };
  }

  if (result.kind === "missing") {
    return { error: strings.memberMissing };
  }
  if (result.kind === "owner-protected") {
    return { error: strings.memberOwnerRemove };
  }
  revalidatePath(`/manage/${boothId}/team`);
  return { success: strings.memberRemoved };
}

export async function acceptTeamInvitationAction(
  _previousState: InvitationAcceptanceState,
  formData: FormData,
): Promise<InvitationAcceptanceState> {
  const strings = await readActionStrings();
  const token = requiredText(formData, "token");
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { error: strings.invitationInvalid };
  }
  const session = await requireUser(`/invitations/${token}`);
  let result: Awaited<ReturnType<typeof acceptTeamInvitation>>;
  try {
    result = await acceptTeamInvitation({
      token,
      userId: session.user.id,
      userEmail: session.user.email,
    });
  } catch (error) {
    console.error("Failed to accept team invitation", error);
    return { error: strings.invitationAcceptFailed };
  }

  if (result.kind === "invalid") {
    return { error: strings.invitationInvalid };
  }
  if (result.kind === "inactive") {
    return { error: strings.invitationInactive };
  }
  if (result.kind === "expired") {
    return { error: strings.invitationExpired };
  }
  if (result.kind === "email-mismatch") {
    return {
      error: strings.invitationEmailMismatch(result.invitedEmail ?? ""),
    };
  }
  if (result.kind === "owner-protected") {
    return { error: strings.invitationOwner };
  }
  if (result.kind === "accepted") {
    const workspacePath = `/manage/${result.boothId}/orders`;
    revalidatePath("/dashboard");
    revalidatePath(`/manage/${result.boothId}/team`);
    redirect(workspacePath);
  }
  return { error: strings.invitationAcceptFailed };
}
