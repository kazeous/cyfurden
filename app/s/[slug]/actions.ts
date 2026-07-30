"use server";

import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseBilingual, parseLocale, translate } from "@/lib/i18n";
import {
  expireStaleOrdersInTransaction,
  ORDER_RESERVATION_TTL_MS,
} from "@/lib/order-inventory";
import {
  aggregateSubmittedOrderLines,
  createOrderPaymentSnapshot,
  PUBLIC_ORDER_MAX_LINES,
  PUBLIC_ORDER_MAX_QUANTITY,
  purchasableVariantStatuses,
  renderTransferReference,
} from "@/lib/order-rules";
import { synchronizeProductInventoryStatus } from "@/lib/product-inventory";
import { applyQuantityPromotions } from "@/lib/quantity-promotions";
import { readStorefrontDocument } from "@/lib/storefront-document";

const lineSchema = z.object({
  productId: z.string().min(1).max(100),
  variantId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(PUBLIC_ORDER_MAX_QUANTITY),
});

const submissionSchema = z.object({
  boothId: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  idempotencyKey: z.uuid(),
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  customerNote: z.string().trim().max(500),
  lines: z.array(lineSchema).min(1).max(PUBLIC_ORDER_MAX_LINES),
});

export type PublicOrderState = {
  status: "idle" | "error";
  message: string;
};

class PublicOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicOrderError";
  }
}

const hasPrismaCode = (error: unknown, code: string) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === code;

function readLines(formData: FormData) {
  try {
    return JSON.parse(String(formData.get("lines") ?? "[]")) as unknown;
  } catch {
    return null;
  }
}

export async function createPublicOrderAction(
  _previousState: PublicOrderState,
  formData: FormData,
): Promise<PublicOrderState> {
  let actionLocale = parseLocale(String(formData.get("locale") ?? ""));
  let strings = translate(actionLocale, "publicBooth");
  const submittedLines = readLines(formData);
  if (submittedLines === null) {
    return {
      status: "error",
      message: strings.cartActionBagUnreadable,
    };
  }

  const parsed = submissionSchema.safeParse({
    boothId: String(formData.get("boothId") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    customerName: String(formData.get("customerName") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? "").trim(),
    customerNote: String(formData.get("customerNote") ?? ""),
    lines: submittedLines,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: strings.cartActionInvalidSubmission,
    };
  }

  let lines;
  try {
    lines = aggregateSubmittedOrderLines(parsed.data.lines);
  } catch {
    return {
      status: "error",
      message: strings.cartActionInvalidQuantity,
    };
  }

  const { boothId, slug, idempotencyKey } = parsed.data;
  let orderCode: string | null = null;

  for (let attempt = 0; attempt < 3 && !orderCode; attempt += 1) {
    try {
      orderCode = await db.$transaction(
        async (transaction) => {
          const duplicate = await transaction.order.findUnique({
            where: {
              boothId_idempotencyKey: { boothId, idempotencyKey },
            },
            select: { code: true },
          });
          if (duplicate) return duplicate.code;

          const booth = await transaction.booth.findFirst({
            where: { id: boothId, slug, status: "PUBLISHED" },
            include: {
              paymentInstructions: true,
              storefront: {
                select: { publishedDocument: true },
              },
              promotions: {
                where: { active: true },
                include: { products: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              },
            },
          });
          if (!booth) {
            throw new PublicOrderError(strings.cartActionStorefrontUnavailable);
          }
          if (booth.storefront?.publishedDocument) {
            const document = readStorefrontDocument(
              booth.storefront.publishedDocument,
              booth.name,
            );
            actionLocale = document.locale;
            strings = translate(actionLocale, "publicBooth");
          }

          const paymentSnapshot = createOrderPaymentSnapshot(
            booth.paymentInstructions,
          );
          if (!paymentSnapshot) {
            throw new PublicOrderError(strings.cartActionPaymentUnavailable);
          }

          const placedAt = new Date();
          await expireStaleOrdersInTransaction(transaction, boothId, placedAt);
          const currentEvent = await transaction.event.findFirst({
            where: {
              boothId,
              startsAt: { lte: placedAt },
              endsAt: { gt: placedAt },
            },
            orderBy: [{ startsAt: "desc" }, { id: "asc" }],
            select: { id: true },
          });

          const requestedVariantIds = lines.map((line) => line.variantId);
          const variants = await transaction.productVariant.findMany({
            where: {
              id: { in: requestedVariantIds },
              product: { boothId, status: "LIVE" },
              status: { in: [...purchasableVariantStatuses] },
            },
            include: { product: true },
          });
          const variantMap = new Map(
            variants.map((variant) => [variant.id, variant]),
          );
          if (variants.length !== lines.length) {
            throw new PublicOrderError(strings.cartActionItemUnavailable);
          }

          const pricedLines = [];
          for (const line of lines) {
            const variant = variantMap.get(line.variantId);
            if (!variant || variant.productId !== line.productId) {
              throw new PublicOrderError(strings.cartActionItemNotFound);
            }

            const tracksInventory = variant.stockQuantity !== null;
            if (tracksInventory) {
              const reserved = await transaction.productVariant.updateMany({
                where: {
                  id: variant.id,
                  productId: variant.productId,
                  product: { boothId, status: "LIVE" },
                  status: { in: [...purchasableVariantStatuses] },
                  stockQuantity: { gte: line.quantity },
                },
                data: { stockQuantity: { decrement: line.quantity } },
              });
              if (!reserved.count) {
                throw new PublicOrderError(
                  strings.cartActionStockUnavailable(
                    parseBilingual(variant.product.name, actionLocale),
                    line.quantity,
                  ),
                );
              }
            }

            const unitPriceCents =
              variant.priceCents ?? variant.product.priceCents;
            if (unitPriceCents < BigInt(0)) {
              throw new PublicOrderError(strings.cartActionInvalidPrice);
            }

            pricedLines.push({
              productId: variant.productId,
              productVariantId: variant.id,
              titleSnapshot: variant.product.name,
              variantSnapshot: variant.label,
              unitPriceCents,
              quantity: line.quantity,
              inventoryDebited: tracksInventory,
            });
          }

          await synchronizeProductInventoryStatus(
            transaction,
            pricedLines.flatMap((line) =>
              line.inventoryDebited ? [line.productId] : [],
            ),
          );

          const promotionPricing = applyQuantityPromotions(
            pricedLines.map((line) => ({
              lineId: line.productVariantId,
              productId: line.productId,
              quantity: line.quantity,
              unitPriceMinorUnits: line.unitPriceCents,
            })),
            booth.promotions.map((promotion) => ({
              id: promotion.id,
              name: promotion.name,
              buyQuantity: promotion.buyQuantity,
              rewardQuantity: promotion.rewardQuantity,
              repeatable: promotion.repeatable,
              buyProductIds: promotion.products.flatMap((product) =>
                product.role === "BUY" ? [product.productId] : [],
              ),
              rewardProductIds: promotion.products.flatMap((product) =>
                product.role === "REWARD" ? [product.productId] : [],
              ),
            })),
          );
          const pricedLineMap = new Map(
            pricedLines.map((line) => [line.productVariantId, line]),
          );
          const orderLines = promotionPricing.lines.flatMap((line) => {
            const source = pricedLineMap.get(line.lineId);
            if (!source) return [];
            return [
              ...(line.paidQuantity
                ? [{ ...source, quantity: line.paidQuantity }]
                : []),
              ...line.allocations.map((allocation) => ({
                ...source,
                unitPriceCents: BigInt(0),
                originalUnitPriceCents: source.unitPriceCents,
                promotionNameSnapshot: allocation.promotionName,
                quantity: allocation.quantity,
              })),
            ];
          });
          const subtotalCents = promotionPricing.subtotalMinorUnits;
          const totalCents = promotionPricing.totalMinorUnits;
          const code = `CYF-${randomBytes(10).toString("hex").toUpperCase()}`;
          const itemSummary =
            pricedLines.length === 1
              ? parseBilingual(pricedLines[0].titleSnapshot, actionLocale)
              : `${parseBilingual(
                  pricedLines[0].titleSnapshot,
                  actionLocale,
                )} +${pricedLines.length - 1}`;
          const transferReference = renderTransferReference(
            booth.paymentInstructions?.transferReferenceTemplate ?? "{code}",
            code,
            itemSummary,
            (totalCents / BigInt(100)).toString(),
          );
          const order = await transaction.order.create({
            data: {
              boothId,
              eventId: currentEvent?.id,
              code,
              status: "PENDING",
              customerName: parsed.data.customerName,
              customerEmail: parsed.data.customerEmail,
              customerNote: parsed.data.customerNote || null,
              subtotalCents,
              totalCents,
              currency: booth.currency,
              transferReference,
              idempotencyKey,
              placedAt,
              expiresAt: new Date(
                placedAt.getTime() + ORDER_RESERVATION_TTL_MS,
              ),
              paymentSnapshot,
              items: { create: orderLines },
            },
            select: { code: true },
          });

          return order.code;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (error instanceof PublicOrderError) {
        return { status: "error", message: error.message };
      }
      if (hasPrismaCode(error, "P2002")) {
        const duplicate = await db.order.findUnique({
          where: { boothId_idempotencyKey: { boothId, idempotencyKey } },
          select: { code: true },
        });
        if (duplicate) orderCode = duplicate.code;
        continue;
      }
      if (hasPrismaCode(error, "P2034") && attempt < 2) continue;

      Sentry.captureException(error, {
        tags: { "cyfurden.operation": "public_order.create" },
      });
      console.error("Public order creation failed", error);
      return {
        status: "error",
        message: strings.cartActionSaveFailed,
      };
    }
  }

  if (!orderCode) {
    return {
      status: "error",
      message: strings.cartActionStockChanged,
    };
  }

  redirect(
    `/s/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(orderCode)}`,
  );
}
