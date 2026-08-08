import { db } from "@/lib/db";

export async function readPublicReservation(input: {
  slug: string;
  code: string;
}) {
  return db.order.findFirst({
    where: {
      code: input.code,
      booth: { slug: input.slug },
    },
    select: {
      code: true,
      status: true,
      currency: true,
      subtotalCents: true,
      totalCents: true,
      transferReference: true,
      customerTransferReference: true,
      idempotencyKey: true,
      paymentSnapshot: true,
      fulfillmentMethod: true,
      items: {
        select: {
          id: true,
          titleSnapshot: true,
          variantSnapshot: true,
          quantity: true,
          unitPriceCents: true,
          originalUnitPriceCents: true,
          promotionNameSnapshot: true,
        },
      },
      booth: {
        select: {
          slug: true,
          name: true,
          storefront: { select: { publishedDocument: true } },
          paymentInstructions: true,
        },
      },
    },
  });
}
