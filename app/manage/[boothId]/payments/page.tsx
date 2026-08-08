import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/admin/order-operations.module.css";
import { requireBoothSection } from "@/lib/authorization";
import { parseBilingual } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/i18n/intl";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { readPaymentReceiptsForManager } from "@/lib/order-admin";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).orderOperations;
  return {
    title: strings.paymentsMetadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const [{ session }, locale] = await Promise.all([
    requireBoothSection(boothId, "payments"),
    readLocaleCookie(),
  ]);
  const result = await readPaymentReceiptsForManager({
    boothId,
    actorUserId: session.user.id,
  });
  if (result.kind !== "found") notFound();
  const catalogue = getWorkspaceStrings(locale);
  const strings = catalogue.orderOperations;
  const paymentState = {
    AWAITING_REVIEW: strings.awaitingReview,
    CONFIRMED: strings.manuallyConfirmed,
    CLOSED: strings.closed,
  } as const;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{strings.paymentsEyebrow}</p>
          <h1>{strings.paymentsTitle}</h1>
          <p>{strings.paymentsDescription}</p>
        </div>
        <nav
          className={styles.headerActions}
          aria-label={strings.paymentsTitle}
        >
          <Link className={styles.button} href={`/manage/${boothId}/orders`}>
            {strings.backToOrders}
          </Link>
          <Link className={styles.button} href={`/manage/${boothId}/shipping`}>
            {strings.shippingManagement}
          </Link>
        </nav>
      </header>
      <aside className={styles.policy} aria-label={strings.paymentPolicyTitle}>
        <span aria-hidden="true">i</span>
        <div>
          <strong>{strings.paymentPolicyTitle}</strong>
          <p>{strings.paymentPolicyBody}</p>
        </div>
      </aside>
      {result.receipts.length ? (
        <section className={styles.panel} aria-labelledby="receipts-title">
          <header className={styles.sectionHeader}>
            <div>
              <h2 id="receipts-title">{strings.receipts}</h2>
            </div>
            <span>{strings.receiptsCount(result.receipts.length)}</span>
          </header>
          <div className={styles.receiptHeader} aria-hidden="true">
            <span>{strings.linkedOrder}</span>
            <span>{strings.customer}</span>
            <span>{strings.amount}</span>
            <span>{strings.paymentState}</span>
            <span>{strings.timestamp}</span>
          </div>
          <ul className={styles.receiptList}>
            {result.receipts.map((receipt) => (
              <li
                className={styles.receiptRow}
                id={`order-${receipt.orderId}`}
                key={receipt.orderId}
              >
                <span data-label={strings.linkedOrder}>
                  <Link href={`/manage/${boothId}/orders/${receipt.orderId}`}>
                    <strong>{receipt.orderCode}</strong>
                  </Link>
                  <small>
                    {catalogue.common.orderStatusLabels[receipt.orderStatus]}
                  </small>
                </span>
                <span data-label={strings.customer}>
                  <strong>{receipt.customerName}</strong>
                  <small>{receipt.customerEmail}</small>
                </span>
                <span data-label={strings.amount}>
                  <strong>
                    {formatMoney(receipt.amountCents, receipt.currency, locale)}
                  </strong>
                  <small>
                    {receipt.paymentMethod
                      ? parseBilingual(receipt.paymentMethod, locale)
                      : strings.bankTransfer}
                  </small>
                </span>
                <span data-label={strings.paymentState}>
                  <span
                    className={styles.paymentBadge}
                    data-state={receipt.paymentState}
                  >
                    {paymentState[receipt.paymentState]}
                  </span>
                  {receipt.customerTransferReference ? (
                    <small>{receipt.customerTransferReference}</small>
                  ) : null}
                </span>
                <span data-label={strings.timestamp}>
                  {formatDateTime(new Date(receipt.timestamp), locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className={styles.emptyState}>
          <div>
            <h2>{strings.noReceipts}</h2>
            <p>{strings.noReceiptsBody}</p>
          </div>
        </section>
      )}
    </div>
  );
}
