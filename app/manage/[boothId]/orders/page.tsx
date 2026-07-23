import Link from "next/link";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import { expireStaleOrders } from "@/lib/order-inventory";
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
    : "30";

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
) => {
  const query = new URLSearchParams({ status, date });
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
    page?: string | string[];
  }>;
}) {
  const { boothId } = await params;
  const query = await searchParams;
  await requireBoothMember(boothId);
  await expireStaleOrders(boothId);

  const selectedStatus = parseStatus(firstValue(query.status));
  const selectedDate = parseDateRange(firstValue(query.date));
  const requestedPage = Math.max(
    1,
    Number.parseInt(firstValue(query.page) ?? "1", 10) || 1,
  );
  const cutoff = getDateCutoff(selectedDate);
  const dateWhere = cutoff ? { placedAt: { gte: cutoff } } : {};

  const [grouped, totalOrderCount] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      where: { boothId, ...dateWhere },
      _count: true,
    }),
    db.order.count({ where: { boothId } }),
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

  const [orders, filteredValue] = await Promise.all([
    db.order.findMany({
      where: filteredWhere,
      include: { items: true },
      orderBy: { placedAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.order.aggregate({
      where: filteredWhere,
      _sum: { totalCents: true },
    }),
  ]);

  const pageUnits = orders.reduce(
    (total, order) =>
      total + order.items.reduce((sum, item) => sum + item.quantity, 0),
    0,
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
                  href={buildOrdersHref(boothId, filter.value, selectedDate)}
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
            {dateRanges.map((range) => {
              const selected = range.value === selectedDate;
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
            <dt>Filtered value</dt>
            <dd>
              {formatMoney(
                filteredValue._sum.totalCents ?? BigInt(0),
                orders[0]?.currency ?? "VND",
              )}
            </dd>
            <small>Across all matching orders</small>
          </div>
          <div>
            <dt>Units on this page</dt>
            <dd>{pageUnits}</dd>
            <small>
              Orders {firstVisible}–{lastVisible}
            </small>
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
                    </th>
                    <td className={styles.dateCell}>
                      {formatDate(order.placedAt)}
                    </td>
                    <td>
                      <OrderItems
                        items={order.items}
                        note={order.customerNote}
                      />
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
                <OrderItems items={order.items} note={order.customerNote} />
                <a
                  className={styles.emailLink}
                  href={`mailto:${order.customerEmail}`}
                >
                  {order.customerEmail}
                </a>
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

function OrderItems({
  items,
  note,
}: {
  items: Array<{
    id: string;
    titleSnapshot: string;
    variantSnapshot: string | null;
    quantity: number;
  }>;
  note: string | null;
}) {
  const visibleItems = items.slice(0, 2);
  return (
    <div className={styles.itemList}>
      {visibleItems.map((item) => (
        <span key={item.id}>
          {item.titleSnapshot}
          {item.variantSnapshot ? ` · ${item.variantSnapshot}` : ""} ×
          {item.quantity}
        </span>
      ))}
      {items.length > visibleItems.length ? (
        <small>
          +{items.length - visibleItems.length} more
          {items.length - visibleItems.length === 1 ? " line" : " lines"}
        </small>
      ) : null}
      {note ? (
        <details className={styles.customerNote}>
          <summary>Customer note</summary>
          <p>{note}</p>
        </details>
      ) : null}
    </div>
  );
}
