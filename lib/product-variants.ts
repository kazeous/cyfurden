import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  isValidProductSku,
  normalizeProductSku,
  parseWholeVndPrice,
} from "@/lib/product-fields";

export const MAX_PRODUCT_VARIANTS = 50;
export const MAX_STOCK_QUANTITY = 2_147_483_647;

export const productVariantStatuses = [
  "AVAILABLE",
  "LOW_STOCK",
  "PREORDER",
  "SOLD_OUT",
  "HIDDEN",
] as const;

export type ProductVariantStatus = (typeof productVariantStatuses)[number];

export type ProductVariantInput = {
  id: string | null;
  sku: string;
  label: string;
  priceCents: bigint | null;
  status: ProductVariantStatus;
  stockQuantity: number | null;
  fulfillmentNote: string | null;
  sortOrder: number;
};

export type ProductVariantManifestError =
  | "invalid"
  | "count"
  | "duplicate-id"
  | "sku"
  | "duplicate-sku"
  | "label"
  | "price"
  | "stock"
  | "note";

const manifestSchema = z
  .array(
    z
      .object({
        id: z.string().trim().min(1).max(100).nullable(),
        sku: z.string().max(160),
        label: z.string().max(160),
        priceVnd: z.string().max(32),
        status: z.enum(productVariantStatuses),
        stockQuantity: z.string().max(32),
        fulfillmentNote: z.string().max(1_000),
      })
      .strict(),
  )
  .min(1)
  .max(MAX_PRODUCT_VARIANTS);

export function parseProductVariantManifest(
  raw: unknown,
):
  | { success: true; data: ProductVariantInput[] }
  | { success: false; error: ProductVariantManifestError } {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const count = Array.isArray(raw) ? raw.length : null;
    return {
      success: false,
      error:
        count !== null && (count < 1 || count > MAX_PRODUCT_VARIANTS)
          ? "count"
          : "invalid",
    };
  }

  const ids = parsed.data
    .map((variant) => variant.id)
    .filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) {
    return { success: false, error: "duplicate-id" };
  }

  const variants: ProductVariantInput[] = [];
  for (const [sortOrder, candidate] of parsed.data.entries()) {
    const sku = normalizeProductSku(candidate.sku);
    if (!isValidProductSku(sku)) {
      return { success: false, error: "sku" };
    }

    const label = candidate.label.trim();
    if (!label || label.length > 80) {
      return { success: false, error: "label" };
    }

    const rawPrice = candidate.priceVnd.trim();
    const priceVnd = rawPrice ? parseWholeVndPrice(rawPrice) : null;
    if (rawPrice && priceVnd === null) {
      return { success: false, error: "price" };
    }

    const rawStock = candidate.stockQuantity.trim();
    const stockQuantity = rawStock ? Number(rawStock) : null;
    if (
      rawStock &&
      (!/^\d+$/.test(rawStock) ||
        !Number.isSafeInteger(stockQuantity) ||
        stockQuantity === null ||
        stockQuantity < 0 ||
        stockQuantity > MAX_STOCK_QUANTITY)
    ) {
      return { success: false, error: "stock" };
    }

    const fulfillmentNote = candidate.fulfillmentNote.trim();
    if (fulfillmentNote.length > 500) {
      return { success: false, error: "note" };
    }

    variants.push({
      id: candidate.id,
      sku,
      label,
      priceCents: priceVnd === null ? null : BigInt(priceVnd) * BigInt(100),
      status: candidate.status,
      stockQuantity,
      fulfillmentNote: fulfillmentNote || null,
      sortOrder,
    });
  }

  if (
    new Set(variants.map((variant) => variant.sku)).size !== variants.length
  ) {
    return { success: false, error: "duplicate-sku" };
  }

  return { success: true, data: variants };
}

export class ProductVariantScopeError extends Error {
  constructor() {
    super("One or more variants do not belong to this product.");
    this.name = "ProductVariantScopeError";
  }
}

export type ProductVariantSyncSummary = {
  created: number;
  updated: number;
  hidden: number;
  deleted: number;
};

export async function synchronizeProductVariants(
  transaction: Prisma.TransactionClient,
  productId: string,
  variants: ProductVariantInput[],
): Promise<ProductVariantSyncSummary> {
  const existing = await transaction.productVariant.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { orderItems: true, gachaPoolItems: true } },
    },
  });
  const existingById = new Map(
    existing.map((variant) => [variant.id, variant]),
  );
  const submittedIds = new Set(
    variants.flatMap((variant) => (variant.id ? [variant.id] : [])),
  );
  if ([...submittedIds].some((id) => !existingById.has(id))) {
    throw new ProductVariantScopeError();
  }

  const summary: ProductVariantSyncSummary = {
    created: 0,
    updated: 0,
    hidden: 0,
    deleted: 0,
  };

  const omitted = existing.filter((variant) => !submittedIds.has(variant.id));
  const referencedOmitted = omitted.filter(
    (variant) =>
      variant._count.orderItems > 0 || variant._count.gachaPoolItems > 0,
  );
  const deletableOmitted = omitted.filter(
    (variant) =>
      variant._count.orderItems === 0 && variant._count.gachaPoolItems === 0,
  );

  // Release submitted SKUs before assigning their final values. This permits
  // safe SKU swaps (A <-> B) and lets a new row reuse the old SKU of a retained
  // row in one atomic save without tripping the product-scoped unique index.
  for (const id of submittedIds) {
    await transaction.productVariant.update({
      where: { id },
      data: { sku: `~SYNC-${id}` },
    });
  }
  if (deletableOmitted.length) {
    const deleted = await transaction.productVariant.deleteMany({
      where: { id: { in: deletableOmitted.map((variant) => variant.id) } },
    });
    summary.deleted = deleted.count;
  }
  for (const [index, variant] of referencedOmitted.entries()) {
    await transaction.productVariant.update({
      where: { id: variant.id },
      data: {
        status: "HIDDEN",
        sortOrder: variants.length + index,
      },
    });
    summary.hidden += 1;
  }

  for (const variant of variants) {
    const data = {
      sku: variant.sku,
      label: variant.label,
      priceCents: variant.priceCents,
      status: variant.status,
      stockQuantity: variant.stockQuantity,
      fulfillmentNote: variant.fulfillmentNote,
      sortOrder: variant.sortOrder,
    };
    if (variant.id) {
      const updated = await transaction.productVariant.updateMany({
        where: { id: variant.id, productId },
        data,
      });
      if (!updated.count) throw new ProductVariantScopeError();
      summary.updated += 1;
    } else {
      await transaction.productVariant.create({
        data: { productId, ...data },
      });
      summary.created += 1;
    }
  }

  return summary;
}
