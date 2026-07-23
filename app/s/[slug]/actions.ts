"use server";

import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
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
  const parsed = submissionSchema.safeParse({
    boothId: String(formData.get("boothId") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    customerName: String(formData.get("customerName") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? "").trim(),
    customerNote: String(formData.get("customerNote") ?? ""),
    lines: readLines(formData),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        "Check your contact details and bag quantities, then send the reservation again.",
    };
  }

  let lines;
  try {
    lines = aggregateSubmittedOrderLines(parsed.data.lines);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The bag contains an invalid quantity.",
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
            include: { paymentInstructions: true },
          });
          if (!booth) {
            throw new PublicOrderError(
              "This storefront is not accepting reservations right now.",
            );
          }

          const paymentSnapshot = createOrderPaymentSnapshot(
            booth.paymentInstructions,
          );
          if (!paymentSnapshot) {
            throw new PublicOrderError(
              "This booth has not finished its payment instructions, so reservations are temporarily unavailable.",
            );
          }

          await expireStaleOrdersInTransaction(
            transaction,
            boothId,
            new Date(),
          );

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
            throw new PublicOrderError(
              "One of these items is no longer available. Refresh the booth and try again.",
            );
          }

          const pricedLines = [];
          for (const line of lines) {
            const variant = variantMap.get(line.variantId);
            if (!variant || variant.productId !== line.productId) {
              throw new PublicOrderError(
                "One of these items could not be found in this booth.",
              );
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
                  `${variant.product.name} no longer has ${line.quantity} available. Refresh the booth to see the latest stock.`,
                );
              }
            }

            const unitPriceCents =
              variant.priceCents ?? variant.product.priceCents;
            if (unitPriceCents < BigInt(0)) {
              throw new PublicOrderError(
                "One of these items has an invalid price and cannot be reserved.",
              );
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

          const totalCents = pricedLines.reduce(
            (sum, line) => sum + line.unitPriceCents * BigInt(line.quantity),
            BigInt(0),
          );
          const code = `CYF-${randomBytes(10).toString("hex").toUpperCase()}`;
          const transferReference = renderTransferReference(
            booth.paymentInstructions?.transferReferenceTemplate ??
              "CYF-{ORDER}",
            code,
          );
          const order = await transaction.order.create({
            data: {
              boothId,
              code,
              status: "PENDING",
              customerName: parsed.data.customerName,
              customerEmail: parsed.data.customerEmail,
              customerNote: parsed.data.customerNote || null,
              subtotalCents: totalCents,
              totalCents,
              currency: booth.currency,
              transferReference,
              idempotencyKey,
              expiresAt: new Date(Date.now() + ORDER_RESERVATION_TTL_MS),
              paymentSnapshot,
              items: { create: pricedLines },
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
        message:
          "The reservation could not be saved. Your bag is still here; wait a moment and try again.",
      };
    }
  }

  if (!orderCode) {
    return {
      status: "error",
      message:
        "Stock changed while the reservation was being saved. Refresh the booth and try again.",
    };
  }

  redirect(
    `/s/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(orderCode)}`,
  );
}
