import { db } from "@/lib/db";
import { assertBoothServiceAccess } from "@/lib/platform-targets";

export async function readPublicReservation(input: {
  slug: string;
  code: string;
}) {
  const reservation = await db.order.findFirst({
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
          serviceState: true,
          storefront: { select: { publishedDocument: true } },
          paymentInstructions: true,
        },
      },
    },
  });
  if (!reservation) return null;
  try {
    assertBoothServiceAccess(reservation.booth.serviceState, "PUBLIC_READ");
  } catch {
    return null;
  }
  return reservation;
}
