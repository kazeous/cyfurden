import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentLocale } from "@/components/i18n/document-locale";
import { ReservationConfirmation } from "@/components/storefront/reservation-confirmation";
import { db } from "@/lib/db";
import { translate } from "@/lib/i18n";
import {
  createOrderPaymentSnapshot,
  readOrderPaymentSnapshot,
} from "@/lib/order-rules";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { generateVietQrDataUrl } from "@/lib/vietqr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const booth = await db.booth.findUnique({
    where: { slug },
    include: { storefront: true },
  });
  const locale = booth?.storefront?.publishedDocument
    ? readStorefrontDocument(booth.storefront.publishedDocument, booth.name)
        .locale
    : undefined;
  const strings = translate(locale, "publicReservation");
  return {
    title: strings.pageTitle,
    description: strings.pageDescription,
  };
}

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
  const tBooth = translate(document.locale, "publicBooth");
  const qrUrl = payment?.qrObjectKey
    ? resolveOracleImageUrl({ objectKey: payment.qrObjectKey })
    : undefined;
  let generatedQrUrl: string | undefined;
  if (payment?.bankCode) {
    try {
      generatedQrUrl = await generateVietQrDataUrl({
        bankCode: payment.bankCode,
        accountNumber: payment.accountNumber,
        accountName: payment.accountName,
        amountMinorUnits: order.totalCents,
        transferReference: order.transferReference,
      });
    } catch {
      generatedQrUrl = undefined;
    }
  }

  return (
    <>
      <DocumentLocale locale={document.locale} />
      <ReservationConfirmation
        boothSlug={order.booth.slug}
        document={document}
        locale={document.locale}
        reservation={{
          code: order.code,
          status: order.status,
          currency: order.currency,
          totalMinorUnits: order.totalCents.toString(),
          transferReference: order.transferReference,
          customerTransferReference: order.customerTransferReference,
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
                qrUrl: generatedQrUrl ?? qrUrl,
                qrSource: generatedQrUrl
                  ? tBooth.reservationQrCaptionGenerated
                  : qrUrl
                    ? tBooth.reservationQrCaptionBooth
                    : undefined,
              }
            : null
        }
      />
    </>
  );
}
