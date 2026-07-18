"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";

const lineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export async function createPublicOrderAction(formData: FormData) {
  const boothId = String(formData.get("boothId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "")
    .trim()
    .toLocaleLowerCase();
  const customerNote = String(formData.get("customerNote") ?? "").trim();
  const lines = z
    .array(lineSchema)
    .min(1, "Add at least one item before sending your reservation.")
    .max(30)
    .parse(JSON.parse(String(formData.get("lines") ?? "[]")));
  const contact = z
    .object({
      customerName: z.string().min(2).max(100),
      customerEmail: z.email(),
      customerNote: z.string().max(500),
    })
    .parse({ customerName, customerEmail, customerNote });

  const booth = await db.booth.findFirst({
    where: { id: boothId, slug, status: "PUBLISHED" },
  });
  if (!booth) throw new Error("This storefront is not available.");

  const requestedVariantIds = lines.map((line) => line.variantId);
  const variants = await db.productVariant.findMany({
    where: {
      id: { in: requestedVariantIds },
      product: { boothId, status: { in: ["LIVE", "SOLD_OUT"] } },
      status: { notIn: ["SOLD_OUT", "HIDDEN"] },
    },
    include: { product: true },
  });
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  if (variants.length !== new Set(requestedVariantIds).size) {
    throw new Error(
      "One of these items is no longer available. Refresh and try again.",
    );
  }

  const pricedLines = lines.map((line) => {
    const variant = variantMap.get(line.variantId);
    if (!variant || variant.productId !== line.productId) {
      throw new Error("One of these items could not be found in this booth.");
    }
    const unitPriceCents = variant.priceCents ?? variant.product.priceCents;
    return {
      productId: variant.productId,
      productVariantId: variant.id,
      titleSnapshot: variant.product.name,
      variantSnapshot: variant.label,
      unitPriceCents,
      quantity: line.quantity,
    };
  });
  const totalCents = pricedLines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  const code = `CYF-${Date.now().toString(36).slice(-6).toUpperCase()}-${randomBytes(
    2,
  )
    .toString("hex")
    .toUpperCase()}`;
  const order = await db.order.create({
    data: {
      boothId,
      code,
      status: "PENDING",
      customerName: contact.customerName,
      customerEmail: contact.customerEmail,
      customerNote: contact.customerNote || null,
      subtotalCents: totalCents,
      totalCents,
      currency: booth.currency,
      transferReference: code,
      idempotencyKey: randomBytes(16).toString("hex"),
      items: { create: pricedLines },
    },
  });

  redirect(`/s/${slug}?order=${encodeURIComponent(order.code)}`);
}
