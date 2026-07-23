import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReservationConfirmation } from "@/components/storefront/reservation-confirmation";
import { db } from "@/lib/db";
import {
  createOrderPaymentSnapshot,
  readOrderPaymentSnapshot,
} from "@/lib/order-rules";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { readStorefrontDocument } from "@/lib/storefront-document";

export const metadata: Metadata = {
  title: "Reservation received · Cyfurden",
  description: "Reservation reference and manual bank-transfer instructions.",
};

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const order = await db.order.findFirst({
    where: {
      code,
      booth: { slug },
    },
    include: {
      items: true,
      booth: {
        include: {
          storefront: true,
          paymentInstructions: true,
        },
      },
    },
  });

  if (!order?.booth.storefront?.publishedDocument) notFound();

  const document = readStorefrontDocument(
    order.booth.storefront.publishedDocument,
    order.booth.name,
  );
  const payment =
    readOrderPaymentSnapshot(order.paymentSnapshot) ??
    createOrderPaymentSnapshot(order.booth.paymentInstructions);
  const qrUrl = payment?.qrObjectKey
    ? resolveOracleImageUrl({ objectKey: payment.qrObjectKey })
    : undefined;

  return (
    <ReservationConfirmation
      boothSlug={order.booth.slug}
      document={document}
      reservation={{
        code: order.code,
        status: order.status,
        currency: order.currency,
        totalMinorUnits: order.totalCents.toString(),
        transferReference: order.transferReference,
        idempotencyKey: order.idempotencyKey,
        items: order.items.map((item) => ({
          id: item.id,
          title: item.titleSnapshot,
          variant: item.variantSnapshot,
          quantity: item.quantity,
          unitPriceMinorUnits: item.unitPriceCents.toString(),
        })),
      }}
      payment={
        payment
          ? {
              bankName: payment.bankName,
              accountName: payment.accountName,
              accountNumber: payment.accountNumber,
              paymentLabel: payment.paymentLabel,
              instructions: payment.instructions,
              disclaimer: payment.disclaimer,
              qrUrl,
            }
          : null
      }
    />
  );
}
