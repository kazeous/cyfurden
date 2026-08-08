import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderDetailSections } from "@/components/admin/order-detail-sections";
import styles from "@/components/admin/order-operations.module.css";
import { requireBoothSection } from "@/lib/authorization";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { readOrderDetailForMember } from "@/lib/order-admin";
import { OrderStatusForm } from "../order-status-form";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).orderOperations;
  return {
    title: strings.detailMetadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ boothId: string; orderId: string }>;
}) {
  const { boothId, orderId } = await params;
  const [{ session, membership }, locale] = await Promise.all([
    requireBoothSection(boothId, "orders"),
    readLocaleCookie(),
  ]);
  const result = await readOrderDetailForMember({
    boothId,
    orderId,
    actorUserId: session.user.id,
  });
  if (result.kind !== "found") notFound();
  const catalogue = getWorkspaceStrings(locale);
  const strings = catalogue.orderOperations;
  const manager = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{strings.detailEyebrow}</p>
          <h1>{result.order.code}</h1>
          <p>{strings.detailDescription}</p>
        </div>
        <nav
          className={styles.headerActions}
          aria-label={strings.detailMetadataTitle}
        >
          <Link className={styles.button} href={`/manage/${boothId}/orders`}>
            {strings.backToOrders}
          </Link>
          {manager ? (
            <Link
              className={styles.button}
              href={`/manage/${boothId}/payments#order-${result.order.id}`}
            >
              {strings.paymentManagement}
            </Link>
          ) : null}
          {manager && result.order.fulfillmentMethod === "SHIP" ? (
            <Link
              className={styles.button}
              href={`/manage/${boothId}/shipping?order=${result.order.id}`}
            >
              {strings.shippingManagement}
            </Link>
          ) : null}
        </nav>
      </header>

      <OrderDetailSections
        order={result.order}
        receiptHistory={result.receiptHistory}
        locale={locale}
        strings={strings}
        statusLabels={catalogue.common.orderStatusLabels}
      />

      <section className={styles.panel} aria-labelledby="order-status-actions">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="order-status-actions">{strings.manageStatus}</h2>
          </div>
        </header>
        <OrderStatusForm
          boothId={boothId}
          orderId={result.order.id}
          orderCode={result.order.code}
          currentStatus={result.order.status}
          locale={locale}
        />
      </section>
    </div>
  );
}
