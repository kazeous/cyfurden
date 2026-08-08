import { parseBilingual, type Locale } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/i18n/intl";
import type { WorkspaceCatalogue } from "@/lib/i18n/workspace";
import type {
  OrderDetailDto,
  OrderReceiptHistoryEntry,
} from "@/lib/order-admin";
import { readOrderPaymentSnapshot } from "@/lib/order-rules";
import styles from "./order-operations.module.css";

export function OrderDetailSections({
  order,
  receiptHistory,
  locale,
  strings,
  statusLabels,
}: {
  order: OrderDetailDto;
  receiptHistory: OrderReceiptHistoryEntry[];
  locale: Locale;
  strings: WorkspaceCatalogue["orderOperations"];
  statusLabels: WorkspaceCatalogue["common"]["orderStatusLabels"];
}) {
  const payment = readOrderPaymentSnapshot(order.paymentSnapshot);
  const savings = BigInt(order.subtotalCents) - BigInt(order.totalCents);

  return (
    <>
      <section
        className={styles.infoGrid}
        aria-label={strings.customerInformation}
      >
        <article>
          <h2>{strings.customerInformation}</h2>
          <dl className={styles.detailList}>
            <Detail label={strings.name}>{order.customerName}</Detail>
            <Detail label={strings.email}>
              <a href={`mailto:${order.customerEmail}`}>
                {order.customerEmail}
              </a>
            </Detail>
            {order.customerPhone ? (
              <Detail label={strings.phone}>
                <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
              </Detail>
            ) : null}
            {order.customerSocialContact ? (
              <Detail label={strings.socialContact}>
                {order.customerSocialContact}
              </Detail>
            ) : null}
            <Detail label={strings.fulfillment}>
              {order.fulfillmentMethod === "SHIP"
                ? strings.ship
                : order.fulfillmentMethod === "PICKUP"
                  ? strings.pickup
                  : strings.legacyFulfillment}
            </Detail>
            {order.shippingAddress ? (
              <Detail
                label={strings.shippingAddress}
                className={styles.address}
              >
                {order.shippingAddress}
              </Detail>
            ) : null}
            {order.customerNote ? (
              <Detail label={strings.customerNote}>{order.customerNote}</Detail>
            ) : null}
          </dl>
        </article>

        <article>
          <h2>{strings.orderPaymentInformation}</h2>
          <dl className={styles.detailList}>
            <Detail label={strings.orderCode}>{order.code}</Detail>
            <Detail label={strings.orderStatus}>
              <span className={styles.statusBadge} data-status={order.status}>
                {statusLabels[order.status]}
              </span>
            </Detail>
            {order.event ? (
              <Detail label={strings.event}>
                {parseBilingual(order.event.name, locale)}
              </Detail>
            ) : null}
            <Detail label={strings.placedAt}>
              {formatDateTime(new Date(order.placedAt), locale)}
            </Detail>
            {order.expiresAt ? (
              <Detail label={strings.expiresAt}>
                {formatDateTime(new Date(order.expiresAt), locale)}
              </Detail>
            ) : null}
            <Detail label={strings.paymentMethod}>
              {payment
                ? parseBilingual(payment.paymentLabel, locale)
                : strings.bankTransfer}
            </Detail>
            <Detail label={strings.transferReference}>
              {order.transferReference}
            </Detail>
            <Detail label={strings.customerTransferReference}>
              {order.customerTransferReference ?? strings.notSubmitted}
            </Detail>
            <Detail label={strings.total}>
              {formatMoney(order.totalCents, order.currency, locale)}
            </Detail>
          </dl>
        </article>
      </section>

      <section className={styles.panel} aria-labelledby="receipt-history-title">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="receipt-history-title">{strings.receiptHistory}</h2>
            <p>{strings.receiptHistoryBody}</p>
          </div>
        </header>
        <div className={styles.receiptHeader} aria-hidden="true">
          <span>{strings.amount}</span>
          <span>{strings.paymentMethod}</span>
          <span>{strings.status}</span>
          <span>{strings.timestamp}</span>
          <span>{strings.notes}</span>
        </div>
        <ol className={styles.receiptList}>
          {receiptHistory.map((entry) => (
            <li className={styles.receiptRow} key={entry.id}>
              <span data-label={strings.amount}>
                <strong>
                  {formatMoney(entry.amountCents, entry.currency, locale)}
                </strong>
              </span>
              <span data-label={strings.paymentMethod}>
                {entry.paymentMethod
                  ? parseBilingual(entry.paymentMethod, locale)
                  : strings.bankTransfer}
              </span>
              <span data-label={strings.status}>
                <span
                  className={styles.statusBadge}
                  data-status={entry.orderStatus}
                >
                  {statusLabels[entry.orderStatus]}
                </span>
              </span>
              <span data-label={strings.timestamp}>
                {formatDateTime(new Date(entry.timestamp), locale)}
              </span>
              <span data-label={strings.notes}>
                {entry.kind === "PLACED"
                  ? strings.reservationPlaced
                  : entry.actorName
                    ? strings.statusChangedBy(entry.actorName)
                    : strings.statusChanged}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={styles.panel}
        aria-labelledby="ordered-products-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="ordered-products-title">{strings.orderedProducts}</h2>
          </div>
        </header>
        <div className={styles.productHeader} aria-hidden="true">
          <span>{strings.product}</span>
          <span>{strings.variant}</span>
          <span>{strings.quantity}</span>
          <span className={styles.numeric}>{strings.unitPrice}</span>
          <span className={styles.numeric}>{strings.lineTotal}</span>
        </div>
        <ul className={styles.productList}>
          {order.items.map((item) => (
            <li className={styles.productRow} key={item.id}>
              <span data-label={strings.product}>
                <strong>{parseBilingual(item.titleSnapshot, locale)}</strong>
                {item.promotionNameSnapshot ? (
                  <small>
                    {strings.promotionReward(
                      parseBilingual(item.promotionNameSnapshot, locale),
                    )}
                  </small>
                ) : null}
              </span>
              <span data-label={strings.variant}>
                {item.variantSnapshot
                  ? parseBilingual(item.variantSnapshot, locale)
                  : strings.standardVariant}
              </span>
              <span data-label={strings.quantity}>{item.quantity}</span>
              <span className={styles.numeric} data-label={strings.unitPrice}>
                {formatMoney(item.unitPriceCents, order.currency, locale)}
                {item.originalUnitPriceCents ? (
                  <small>
                    {strings.originalPrice(
                      formatMoney(
                        item.originalUnitPriceCents,
                        order.currency,
                        locale,
                      ),
                    )}
                  </small>
                ) : null}
              </span>
              <span className={styles.numeric} data-label={strings.lineTotal}>
                <strong>
                  {formatMoney(
                    BigInt(item.unitPriceCents) * BigInt(item.quantity),
                    order.currency,
                    locale,
                  )}
                </strong>
              </span>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <div>
            <dt>{strings.subtotal}</dt>
            <dd>{formatMoney(order.subtotalCents, order.currency, locale)}</dd>
          </div>
          {savings > BigInt(0) ? (
            <div>
              <dt>{strings.promotionSavings}</dt>
              <dd>−{formatMoney(savings, order.currency, locale)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{strings.total}</dt>
            <dd>
              <strong>
                {formatMoney(order.totalCents, order.currency, locale)}
              </strong>
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function Detail({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={className}>{children}</dd>
    </div>
  );
}
import type { ReactNode } from "react";
