import Link from "next/link";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { expireStaleOrders } from "@/lib/order-inventory";
import { evaluateBoothChecklist } from "@/lib/orders-checklist";
import { hoChiMinhTodayWindow, parseTodayQuery } from "@/lib/orders-today";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { OrderStatusForm } from "./order-status-form";
import styles from "./orders.module.css";

const orderStatuses = [
  "PENDING",
  "CONFIRMED",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
] as const;

type OrderStatus = (typeof orderStatuses)[number];
type StatusFilter = OrderStatus | "ALL";
type DateRange = "7" | "30" | "90" | "all";

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Needs review" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];

const dateRanges: Array<{ value: DateRange; label: string }> = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

const PAGE_SIZE = 25;

const formatMoney = (priceCents: number | bigint, currency: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(BigInt(priceCents) / BigInt(100));

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const parseStatus = (value: string | undefined): StatusFilter => {
  if (value === "ALL" || orderStatuses.includes(value as OrderStatus)) {
    return value as StatusFilter;
  }
  return "ALL";
};

const parseDateRange = (value: string | undefined): DateRange =>
  dateRanges.some((range) => range.value === value)
    ? (value as DateRange)
    : "7";

const getDateCutoff = (range: DateRange) => {
  if (range === "all") return undefined;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(range));
  return cutoff;
};

const buildOrdersHref = (
  boothId: string,
  status: StatusFilter,
  date: DateRange,
  page?: number,
  today = false,
) => {
  const query = new URLSearchParams({ status });
  if (today) query.set("today", "1");
  else query.set("date", date);
  if (page && page > 1) query.set("page", String(page));
  return `/manage/${boothId}/orders?${query.toString()}`;
};

const statusLabel = (status: OrderStatus) =>
  statusFilters.find((filter) => filter.value === status)?.label ?? status;

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{
    status?: string | string[];
    date?: string | string[];
    today?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { boothId } = await params;
  const query = await searchParams;
  await requireBoothSection(boothId, "orders");
  await expireStaleOrders(boothId);

  const selectedStatus = parseStatus(firstValue(query.status));
  const selectedDate = parseDateRange(firstValue(query.date));
  const selectedToday = parseTodayQuery(query.today);
  const requestedPage = Math.max(
    1,
    Number.parseInt(firstValue(query.page) ?? "1", 10) || 1,
  );
  const cutoff = selectedToday
    ? hoChiMinhTodayWindow()
    : getDateCutoff(selectedDate);
  const dateWhere =
    cutoff instanceof Date
      ? { placedAt: { gte: cutoff } }
      : cutoff
        ? { placedAt: cutoff }
        : {};

  const [grouped, totalOrderCount, boothWithSettings, liveProductCount] =
    await Promise.all([
      db.order.groupBy({
        by: ["status"],
        where: { boothId, ...dateWhere },
        _count: true,
      }),
      db.order.count({ where: { boothId } }),
      db.booth.findUnique({
        where: { id: boothId },
        include: { paymentInstructions: true, storefront: true },
      }),
      db.product.count({
        where: {
          boothId,
          status: "LIVE",
        },
      }),
    ]);

  const counts = new Map(grouped.map((entry) => [entry.status, entry._count]));
  const scopedOrderCount = grouped.reduce(
    (total, entry) => total + entry._count,
    0,
  );
  const filteredOrderCount =
    selectedStatus === "ALL"
      ? scopedOrderCount
      : (counts.get(selectedStatus) ?? 0);
  const totalPages = Math.max(1, Math.ceil(filteredOrderCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const filteredWhere = {
    boothId,
    ...dateWhere,
    ...(selectedStatus === "ALL" ? {} : { status: selectedStatus }),
  };

  const orders = await db.order.findMany({
    where: filteredWhere,
    include: { items: true },
    orderBy: { placedAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const pageUnits = orders.reduce(
    (total, order) =>
      total + order.items.reduce((sum, item) => sum + item.quantity, 0),
    0,
  );
  const pageValue = orders.reduce(
    (total, order) => total + order.totalCents,
    BigInt(0),
  );
  const firstVisible = filteredOrderCount
    ? (currentPage - 1) * PAGE_SIZE + 1
    : 0;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filteredOrderCount);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const isFirstUse = totalOrderCount === 0;
  const activeStatusLabel =
    statusFilters.find((filter) => filter.value === selectedStatus)?.label ??
    "orders";

  const payment = boothWithSettings?.paymentInstructions;
  const storefrontDoc = boothWithSettings?.storefront?.publishedDocument
    ? readStorefrontDocument(
        boothWithSettings.storefront.publishedDocument,
        boothWithSettings.name,
      )
    : null;

  const checklistItems = evaluateBoothChecklist({
    hasLiveProduct: liveProductCount > 0,
    payment,
    storefront: storefrontDoc,
  });
  const incompleteChecklistCount = checklistItems.filter(
    (item) => !item.complete,
  ).length;
  const hasChecklist = incompleteChecklistCount > 0;

  return (
    <div className={styles.ordersPage}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Live operations</p>
          <h1>Orders</h1>
          <p>
            Review reservations, confirm bank transfers manually, and prepare
            fulfilment.
          </p>
        </div>
      </header>

      <aside className={styles.manualNotice} aria-label="Payment review policy">
        <span className={styles.noticeIcon} aria-hidden="true">
          i
        </span>
        <div>
          <strong>Manual bank-transfer review</strong>
          <p>
            Cyfurden does not verify payments. Confirm an order only after booth
            staff checks the transfer outside Cyfurden.
          </p>
        </div>
      </aside>

      {hasChecklist ? (
        <aside
          className={styles.setupChecklist}
          aria-label="Booth setup checklist"
        >
          <header>
            <span className={styles.noticeIcon} aria-hidden="true">
              ⚠
            </span>
            <strong>Attention needed</strong>
            <span className={styles.checklistCount}>
              {incompleteChecklistCount}{" "}
              {incompleteChecklistCount === 1 ? "item" : "items"} remaining
            </span>
          </header>
          <ul>
            {checklistItems.map((item) => (
              <li key={item.key} data-complete={item.complete}>
                <span className={styles.checklistMark} aria-hidden="true">
                  {item.complete ? "✓" : "○"}
                </span>
                {item.complete ? (
                  <span>{item.label}</span>
                ) : (
                  <Link href={`/manage/${boothId}/${item.destination}`}>
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <section className={styles.filters} aria-labelledby="order-filters-title">
        <div className={styles.filterHeader}>
          <div>
            <h2 id="order-filters-title">Order queue</h2>
            <p>Narrow the queue by status and reservation date.</p>
          </div>
          <span className={styles.resultCount} aria-live="polite">
            {filteredOrderCount} {filteredOrderCount === 1 ? "order" : "orders"}
          </span>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Status</span>
          <nav className={styles.statusFilters} aria-label="Order status">
            {statusFilters.map((filter) => {
              const count =
                filter.value === "ALL"
                  ? scopedOrderCount
                  : (counts.get(filter.value) ?? 0);
              const selected = filter.value === selectedStatus;
              return (
                <Link
                  key={filter.value}
                  href={buildOrdersHref(
                    boothId,
                    filter.value,
                    selectedDate,
                    undefined,
                    selectedToday,
                  )}
                  className={styles.statusFilter}
                  aria-current={selected ? "page" : undefined}
                >
                  <span>{filter.label}</span>
                  <span className={styles.filterCount}>{count}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Placed</span>
          <nav className={styles.dateFilters} aria-label="Order date range">
            <Link
              href={buildOrdersHref(
                boothId,
                selectedStatus,
                selectedDate,
                undefined,
                true,
              )}
              className={styles.dateFilter}
              aria-current={selectedToday ? "page" : undefined}
            >
              Today
            </Link>
            {dateRanges.map((range) => {
              const selected = !selectedToday && range.value === selectedDate;
              return (
                <Link
                  key={range.value}
                  href={buildOrdersHref(boothId, selectedStatus, range.value)}
                  className={styles.dateFilter}
                  aria-current={selected ? "page" : undefined}
                >
                  {range.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      {filteredOrderCount > 0 ? (
        <dl className={styles.metrics} aria-label="Filtered order summary">
          <div>
            <dt>Orders shown</dt>
            <dd>{orders.length}</dd>
            <small>
              {firstVisible}–{lastVisible} of {filteredOrderCount} matching
            </small>
          </div>
          <div>
            <dt>Page value</dt>
            <dd>{formatMoney(pageValue, orders[0]?.currency ?? "VND")}</dd>
            <small>Current page total</small>
          </div>
          <div>
            <dt>Units requested</dt>
            <dd>{pageUnits}</dd>
            <small>Across orders shown</small>
          </div>
        </dl>
      ) : null}

      {orders.length ? (
        <section
          className={styles.resourceIndex}
          aria-labelledby="results-title"
        >
          <div className={styles.resultsHeader}>
            <div>
              <h2 id="results-title">{activeStatusLabel}</h2>
              <p>
                Showing {firstVisible}–{lastVisible} of {filteredOrderCount}
              </p>
            </div>
            <span>25 rows per page</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.orderTable}>
              <caption className={styles.srOnly}>
                Orders matching the selected status and date range
              </caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Items</th>
                  <th scope="col" className={styles.numericCell}>
                    Total
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Update status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <th scope="row">
                      <span className={styles.orderCode}>{order.code}</span>
                      <span className={styles.customerName}>
                        {order.customerName}
                      </span>
                      <a href={`mailto:${order.customerEmail}`}>
                        {order.customerEmail}
                      </a>
                      {order.customerPhone ? (
                        <a href={`tel:${order.customerPhone}`}>
                          {order.customerPhone}
                        </a>
                      ) : null}
                    </th>
                    <td className={styles.dateCell}>
                      {formatDate(order.placedAt)}
                    </td>
                    <td>
                      <OrderDetails order={order} />
                    </td>
                    <td className={styles.numericCell}>
                      <strong>
                        {formatMoney(order.totalCents, order.currency)}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        data-status={order.status}
                      >
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className={styles.actionCell}>
                      <OrderStatusForm
                        boothId={boothId}
                        orderId={order.id}
                        orderCode={order.code}
                        currentStatus={order.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={styles.mobileCards} aria-label="Orders">
            {orders.map((order) => (
              <li key={order.id} className={styles.mobileCard}>
                <div className={styles.mobileCardHeader}>
                  <div>
                    <span className={styles.orderCode}>{order.code}</span>
                    <strong>{order.customerName}</strong>
                  </div>
                  <span
                    className={styles.statusBadge}
                    data-status={order.status}
                  >
                    {statusLabel(order.status)}
                  </span>
                </div>
                <dl className={styles.mobileDetails}>
                  <div>
                    <dt>Placed</dt>
                    <dd>{formatDate(order.placedAt)}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{formatMoney(order.totalCents, order.currency)}</dd>
                  </div>
                </dl>
                <OrderDetails order={order} />
                <div className={styles.contactLinks}>
                  <a
                    className={styles.emailLink}
                    href={`mailto:${order.customerEmail}`}
                  >
                    {order.customerEmail}
                  </a>
                  {order.customerPhone ? (
                    <a href={`tel:${order.customerPhone}`}>
                      {order.customerPhone}
                    </a>
                  ) : null}
                </div>
                <OrderStatusForm
                  boothId={boothId}
                  orderId={order.id}
                  orderCode={order.code}
                  currentStatus={order.status}
                />
              </li>
            ))}
          </ul>

          <div className={styles.pagination}>
            <p>
              Showing {firstVisible}–{lastVisible} of {filteredOrderCount}{" "}
              matching orders
            </p>
            <nav aria-label="Order pages">
              {hasPreviousPage ? (
                <Link
                  href={buildOrdersHref(
                    boothId,
                    selectedStatus,
                    selectedDate,
                    currentPage - 1,
                    selectedToday,
                  )}
                >
                  Previous
                </Link>
              ) : (
                <span aria-disabled="true">Previous</span>
              )}
              <strong>
                Page {currentPage} of {totalPages}
              </strong>
              {hasNextPage ? (
                <Link
                  href={buildOrdersHref(
                    boothId,
                    selectedStatus,
                    selectedDate,
                    currentPage + 1,
                    selectedToday,
                  )}
                >
                  Next
                </Link>
              ) : (
                <span aria-disabled="true">Next</span>
              )}
            </nav>
          </div>
        </section>
      ) : (
        <section className={styles.emptyState} aria-labelledby="empty-title">
          <span aria-hidden="true">◎</span>
          <div>
            <h2 id="empty-title">
              {isFirstUse ? "No orders yet" : "No matching orders"}
            </h2>
            <p>
              {isFirstUse
                ? "Reservations from the public storefront will appear here. Payment remains pending until booth staff reviews the bank transfer manually."
                : "Try a different status or a wider date range to find the order you need."}
            </p>
            {isFirstUse ? null : (
              <Link
                className={styles.emptyAction}
                href={buildOrdersHref(boothId, "ALL", "all")}
              >
                Clear filters
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function OrderDetails({
  order,
}: {
  order: {
    code: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    customerNote: string | null;
    customerTransferReference: string | null;
    transferReference: string;
    subtotalCents: bigint;
    totalCents: bigint;
    currency: string;
    placedAt: Date;
    expiresAt: Date | null;
    confirmedAt: Date | null;
    fulfilledAt: Date | null;
    items: Array<{
      id: string;
      titleSnapshot: string;
      variantSnapshot: string | null;
      unitPriceCents: bigint;
      quantity: number;
    }>;
  };
}) {
  const visibleItems = order.items.slice(0, 2);
  const unitCount = order.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  return (
    <div className={styles.itemList}>
      {visibleItems.map((item) => (
        <span key={item.id}>
          {item.titleSnapshot}
          {item.variantSnapshot ? ` · ${item.variantSnapshot}` : ""} ×
          {item.quantity}
        </span>
      ))}
      {order.items.length > visibleItems.length ? (
        <small>
          +{order.items.length - visibleItems.length} more
          {order.items.length - visibleItems.length === 1 ? " line" : " lines"}
        </small>
      ) : null}
      <small>
        {unitCount} {unitCount === 1 ? "unit" : "units"} requested
      </small>
      <details className={styles.orderDetail}>
        <summary>View full order</summary>
        <div className={styles.orderDetailBody}>
          <dl className={styles.orderDetailMeta}>
            <div>
              <dt>Customer</dt>
              <dd>{order.customerName}</dd>
              <dd>
                <a href={`mailto:${order.customerEmail}`}>
                  {order.customerEmail}
                </a>
              </dd>
              {order.customerPhone ? (
                <dd>
                  <a href={`tel:${order.customerPhone}`}>
                    {order.customerPhone}
                  </a>
                </dd>
              ) : null}
            </div>
            <div>
              <dt>Transfer message</dt>
              <dd className={styles.referenceValue}>
                {order.transferReference}
              </dd>
            </div>
            <div>
              <dt>Customer bank reference</dt>
              <dd className={styles.referenceValue}>
                {order.customerTransferReference ?? "Not submitted"}
              </dd>
            </div>
            <div>
              <dt>Timeline</dt>
              <dd>Placed {formatDate(order.placedAt)}</dd>
              {order.expiresAt ? (
                <dd>Reservation limit {formatDate(order.expiresAt)}</dd>
              ) : null}
              {order.confirmedAt ? (
                <dd>Confirmed {formatDate(order.confirmedAt)}</dd>
              ) : null}
              {order.fulfilledAt ? (
                <dd>Fulfilled {formatDate(order.fulfilledAt)}</dd>
              ) : null}
            </div>
          </dl>

          <section
            className={styles.orderLines}
            aria-label="Complete item list"
          >
            <h3>Items</h3>
            <ul>
              {order.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.titleSnapshot}</strong>
                    <span>
                      {item.variantSnapshot ?? "Standard"} · {item.quantity} ×{" "}
                      {formatMoney(item.unitPriceCents, order.currency)}
                    </span>
                  </div>
                  <strong>
                    {formatMoney(
                      item.unitPriceCents * BigInt(item.quantity),
                      order.currency,
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          {order.customerNote ? (
            <section className={styles.orderNote} aria-label="Customer note">
              <h3>Customer note</h3>
              <p>{order.customerNote}</p>
            </section>
          ) : null}

          <dl className={styles.orderTotals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
            </div>
            <div>
              <dt>Order total</dt>
              <dd>{formatMoney(order.totalCents, order.currency)}</dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}
