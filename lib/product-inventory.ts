import type { Prisma } from "@/generated/prisma/client";
import { purchasableVariantStatuses } from "@/lib/order-rules";

export type ProductInventoryStatus = "DRAFT" | "LIVE" | "SOLD_OUT" | "HIDDEN";

export type ProductInventoryVariant = {
  status: string;
  stockQuantity: number | null;
};

const purchasableStatuses = new Set<string>(purchasableVariantStatuses);

export const productAttentionWhere = {
  OR: [
    { status: "SOLD_OUT" },
    {
      status: "LIVE",
      variants: { some: { status: "LOW_STOCK" } },
    },
  ],
} satisfies Prisma.ProductWhereInput;

export function hasPurchasableInventory(variants: ProductInventoryVariant[]) {
  return variants.some(
    (variant) =>
      purchasableStatuses.has(variant.status) &&
      (variant.stockQuantity === null || variant.stockQuantity > 0),
  );
}

export function isProductInventoryExhausted(
  variants: ProductInventoryVariant[],
) {
  const trackedVariants = variants.filter(
    (variant) => variant.stockQuantity !== null,
  );
  const hasPurchasableUntrackedVariant = variants.some(
    (variant) =>
      variant.stockQuantity === null && purchasableStatuses.has(variant.status),
  );

  return (
    trackedVariants.length > 0 &&
    !hasPurchasableUntrackedVariant &&
    trackedVariants.every((variant) => variant.stockQuantity === 0)
  );
}

export function resolveProductStatusAfterInventoryChange(
  currentStatus: ProductInventoryStatus,
  variants: ProductInventoryVariant[],
  { restoreSoldOut = false }: { restoreSoldOut?: boolean } = {},
) {
  if (currentStatus === "LIVE" && isProductInventoryExhausted(variants)) {
    return "SOLD_OUT" as const;
  }
  if (
    restoreSoldOut &&
    currentStatus === "SOLD_OUT" &&
    hasPurchasableInventory(variants)
  ) {
    return "LIVE" as const;
  }
  return currentStatus;
}

export async function synchronizeProductInventoryStatus(
  transaction: Prisma.TransactionClient,
  productIds: Iterable<string>,
  options?: { restoreSoldOut?: boolean },
) {
  const changes: Array<{
    productId: string;
    from: ProductInventoryStatus;
    to: ProductInventoryStatus;
  }> = [];

  for (const productId of new Set(productIds)) {
    const product = await transaction.product.findUnique({
      where: { id: productId },
      select: {
        status: true,
        variants: {
          select: { status: true, stockQuantity: true },
        },
      },
    });
    if (!product) continue;

    const nextStatus = resolveProductStatusAfterInventoryChange(
      product.status,
      product.variants,
      options,
    );
    if (nextStatus === product.status) continue;

    const updated = await transaction.product.updateMany({
      where: { id: productId, status: product.status },
      data: { status: nextStatus },
    });
    if (updated.count) {
      changes.push({
        productId,
        from: product.status,
        to: nextStatus,
      });
    }
  }

  return changes;
}

export async function synchronizeProductInventoryStatusForVariants(
  transaction: Prisma.TransactionClient,
  variantIds: Iterable<string>,
  options?: { restoreSoldOut?: boolean },
) {
  const uniqueVariantIds = [...new Set(variantIds)];
  if (!uniqueVariantIds.length) return [];

  const variants = await transaction.productVariant.findMany({
    where: { id: { in: uniqueVariantIds } },
    select: { productId: true },
  });

  return synchronizeProductInventoryStatus(
    transaction,
    variants.map((variant) => variant.productId),
    options,
  );
}
