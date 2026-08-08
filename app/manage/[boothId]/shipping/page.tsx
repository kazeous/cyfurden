import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderDetailSections } from "@/components/admin/order-detail-sections";
import styles from "@/components/admin/order-operations.module.css";
import { ShipmentForm } from "@/components/admin/shipment-form";
import { requireBoothSection } from "@/lib/authorization";
import { formatDateTime } from "@/lib/i18n/intl";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import {
  readOrderDetailForManager,
  readShippingOrdersForManager,
} from "@/lib/order-admin";

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).orderOperations;
  return {
    title: strings.shippingMetadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function ShippingPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const { boothId } = await params;
  const query = await searchParams;
  const [{ session }, locale] = await Promise.all([
    requireBoothSection(boothId, "shipping"),
    readLocaleCookie(),
  ]);
  const listResult = await readShippingOrdersForManager({
    boothId,
    actorUserId: session.user.id,
  });
  if (listResult.kind !== "found") notFound();
  const catalogue = getWorkspaceStrings(locale);
  const strings = catalogue.orderOperations;
  const requestedId = firstValue(query.order);
  const selectedId = listResult.orders.some((order) => order.id === requestedId)
    ? requestedId
    : listResult.orders[0]?.id;
  const detailResult = selectedId
    ? await readOrderDetailForManager({
        boothId,
        orderId: selectedId,
        actorUserId: session.user.id,
      })
    : null;
  const selected =
    detailResult?.kind === "found" &&
    detailResult.order.fulfillmentMethod === "SHIP"
      ? detailResult
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{strings.shippingEyebrow}</p>
          <h1>{strings.shippingTitle}</h1>
          <p>{strings.shippingDescription}</p>
        </div>
        <nav
          className={styles.headerActions}
          aria-label={strings.shippingTitle}
        >
          <Link className={styles.button} href={`/manage/${boothId}/orders`}>
            {strings.backToOrders}
          </Link>
          <Link className={styles.button} href={`/manage/${boothId}/payments`}>
            {strings.paymentManagement}
          </Link>
        </nav>
      </header>
      <aside className={styles.policy} aria-label={strings.shippingPolicyTitle}>
        <span aria-hidden="true">i</span>
        <div>
          <strong>{strings.shippingPolicyTitle}</strong>
          <p>{strings.shippingPolicyBody}</p>
        </div>
      </aside>
      {listResult.orders.length ? (
        <div className={styles.operationsLayout}>
          <section
            className={styles.panel}
            aria-labelledby="shipped-orders-title"
          >
            <header className={styles.sectionHeader}>
              <div>
                <h2 id="shipped-orders-title">{strings.shippedOrders}</h2>
              </div>
              <span>
                {strings.shippedOrdersCount(listResult.orders.length)}
              </span>
            </header>
            <nav
              className={styles.shippingList}
              aria-label={strings.shippedOrders}
            >
              {listResult.orders.map((order) => (
                <Link
                  className={styles.shippingLink}
                  aria-current={order.id === selectedId ? "page" : undefined}
                  href={`/manage/${boothId}/shipping?order=${order.id}`}
                  key={order.id}
                >
                  <strong>{order.code}</strong>
                  <span>{order.customerName}</span>
                  <small>
                    {formatDateTime(new Date(order.placedAt), locale)} ·{" "}
                    {order.shipmentTrackingNumber
                      ? strings.trackingRecorded
                      : strings.trackingNotRecorded}
                  </small>
                </Link>
              ))}
            </nav>
          </section>
          {selected ? (
            <div className={styles.page}>
              <section
                className={styles.panel}
                aria-labelledby="shipment-record-title"
              >
                <header className={styles.sectionHeader}>
                  <div>
                    <h2 id="shipment-record-title">{strings.shipmentRecord}</h2>
                    <p>{strings.shipmentRecordBody}</p>
                  </div>
                  <Link
                    className={styles.button}
                    href={`/manage/${boothId}/orders/${selected.order.id}`}
                  >
                    {strings.openOrder}
                  </Link>
                </header>
                <ShipmentForm
                  boothId={boothId}
                  orderId={selected.order.id}
                  shipment={{
                    carrier: selected.order.shipmentCarrier,
                    trackingNumber: selected.order.shipmentTrackingNumber,
                    trackingUrl: selected.order.shipmentTrackingUrl,
                  }}
                  locale={locale}
                />
              </section>
              <OrderDetailSections
                order={selected.order}
                receiptHistory={selected.receiptHistory}
                locale={locale}
                strings={strings}
                statusLabels={catalogue.common.orderStatusLabels}
              />
            </div>
          ) : (
            <section className={styles.emptyState}>
              <h2>{strings.selectShippedOrder}</h2>
            </section>
          )}
        </div>
      ) : (
        <section className={styles.emptyState}>
          <div>
            <h2>{strings.noShippedOrders}</h2>
            <p>{strings.noShippedOrdersBody}</p>
          </div>
        </section>
      )}
    </div>
  );
}
