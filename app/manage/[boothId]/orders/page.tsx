import type { Metadata } from "next";
import Link from "next/link";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { parseBilingual, type Locale } from "@/lib/i18n";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import {
  eventDateInput,
  eventPeriod,
  orderEventWhere,
  parseOrderViewMode,
  resolveEventSelection,
  type EventSelection,
  type OrderViewMode,
} from "@/lib/order-events";
import { expireStaleOrders } from "@/lib/order-inventory";
import { evaluateBoothChecklist } from "@/lib/orders-checklist";
import { hoChiMinhTodayWindow, parseTodayQuery } from "@/lib/orders-today";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { EventEditor } from "./event-editor";
import { OrdersLiveRefresh } from "./live-refresh";
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

const dateRangeValues: DateRange[] = ["7", "30", "90", "all"];

const PAGE_SIZE = 25;

const formatMoney = (
  priceCents: number | bigint,
  currency: string,
  locale: Locale,
) =>
  new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(BigInt(priceCents) / BigInt(100));

const formatDate = (date: Date, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
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
  dateRangeValues.includes(value as DateRange) ? (value as DateRange) : "7";

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
  mode: OrderViewMode = "queue",
  event: EventSelection = "ALL",
) => {
  const query = new URLSearchParams({ status });
  if (mode === "events") {
    query.set("mode", "events");
    query.set("event", event);
  } else if (today) query.set("today", "1");
  else query.set("date", date);
  if (page && page > 1) query.set("page", String(page));
  return `/manage/${boothId}/orders?${query.toString()}`;
};

const formatEventRange = (startsAt: Date, endsAt: Date, locale: Locale) => {
  const formatter = new Intl.DateTimeFormat(
    locale === "vi" ? "vi-VN" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    },
  );
  return `${formatter.format(startsAt)} – ${formatter.format(
    new Date(endsAt.getTime() - 1),
  )}`;
};

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).orders;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

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
    mode?: string | string[];
    event?: string | string[];
  }>;
}) {
  const { boothId } = await params;
  const query = await searchParams;
  const [{ membership }, locale] = await Promise.all([
    requireBoothSection(boothId, "orders"),
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.orders;
  const statusFilters: Array<{ value: StatusFilter; label: string }> = [
    { value: "ALL", label: strings.filterAll },
    { value: "PENDING", label: strings.filterNeedsReview },
    { value: "CONFIRMED", label: strings.filterConfirmed },
    { value: "FULFILLED", label: strings.filterFulfilled },
    { value: "CANCELLED", label: strings.filterCancelled },
    { value: "EXPIRED", label: strings.filterExpired },
  ];
  const dateRanges: Array<{ value: DateRange; label: string }> = [
    { value: "7", label: strings.range7 },
    { value: "30", label: strings.range30 },
    { value: "90", label: strings.range90 },
    { value: "all", label: strings.rangeAll },
  ];
  const statusLabel = (status: OrderStatus) =>
    workspaceStrings.common.orderStatusLabels[status];
  await expireStaleOrders(boothId);

  const selectedMode = parseOrderViewMode(query.mode);
  const selectedStatus = parseStatus(firstValue(query.status));
  const selectedDate = parseDateRange(firstValue(query.date));
  const selectedToday = parseTodayQuery(query.today);
  const requestedPage = Math.max(
    1,
    Number.parseInt(firstValue(query.page) ?? "1", 10) || 1,
  );
  const events = await db.event.findMany({
    where: { boothId },
    include: { _count: { select: { orders: true } } },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
  });
  const selectedEvent = resolveEventSelection(
    query.event,
    events.map((event) => event.id),
  );
  const cutoff =
    selectedMode === "events"
      ? undefined
      : selectedToday
        ? hoChiMinhTodayWindow()
        : getDateCutoff(selectedDate);
  const dateWhere =
    cutoff instanceof Date
      ? { placedAt: { gte: cutoff } }
      : cutoff
        ? { placedAt: cutoff }
        : {};
  const eventWhere = orderEventWhere(selectedMode, selectedEvent);
  const scopedWhere = { boothId, ...eventWhere, ...dateWhere };

  const [
    grouped,
    totalOrderCount,
    boothWithSettings,
    liveProductCount,
    latestOrder,
  ] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      where: scopedWhere,
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
    db.order.findFirst({
      where: { boothId },
      select: {
        id: true,
        code: true,
        placedAt: true,
        status: true,
      },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
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
    ...scopedWhere,
    ...(selectedStatus === "ALL" ? {} : { status: selectedStatus }),
  };

  const orders = await db.order.findMany({
    where: filteredWhere,
    include: { event: { select: { id: true, name: true } }, items: true },
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
  const canManageEvents =
    membership.role === "OWNER" || membership.role === "ADMIN";
  const activeStatusLabel =
    statusFilters.find((filter) => filter.value === selectedStatus)?.label ??
    strings.filterAll;

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
          <p className={styles.eyebrow}>{strings.eyebrow}</p>
          <h1>{strings.title}</h1>
          <p>{strings.description}</p>
        </div>
        <OrdersLiveRefresh
          boothId={boothId}
          boothName={
            parseBilingual(boothWithSettings?.name, locale) || strings.thisBooth
          }
          locale={locale}
          latestOrder={
            latestOrder
              ? {
                  ...latestOrder,
                  placedAt: latestOrder.placedAt.toISOString(),
                }
              : null
          }
        />
      </header>

      <aside
        className={styles.manualNotice}
        aria-label={strings.paymentPolicyAria}
      >
        <span className={styles.noticeIcon} aria-hidden="true">
          i
        </span>
        <div>
          <strong>{strings.manualReviewTitle}</strong>
          <p>{strings.manualReviewBody}</p>
        </div>
      </aside>

      {hasChecklist ? (
        <aside
          className={styles.setupChecklist}
          aria-label={strings.checklistAria}
        >
          <header>
            <span className={styles.noticeIcon} aria-hidden="true">
              ⚠
            </span>
            <strong>{strings.attentionNeeded}</strong>
            <span className={styles.checklistCount}>
              {strings.checklistBody(incompleteChecklistCount)}
            </span>
          </header>
          <ul>
            {checklistItems.map((item) => (
              <li key={item.key} data-complete={item.complete}>
                <span className={styles.checklistMark} aria-hidden="true">
                  {item.complete ? "✓" : "○"}
                </span>
                {item.complete ? (
                  <span>{strings.checklistLabels[item.key]}</span>
                ) : (
                  <Link href={`/manage/${boothId}/${item.destination}`}>
                    {strings.checklistLabels[item.key]}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <nav className={styles.orderModes} aria-label={strings.ordersViewAria}>
        <Link
          href={buildOrdersHref(boothId, selectedStatus, selectedDate)}
          aria-current={selectedMode === "queue" ? "page" : undefined}
        >
          {strings.queue}
          <span>{totalOrderCount}</span>
        </Link>
        <Link
          href={buildOrdersHref(
            boothId,
            selectedStatus,
            "all",
            undefined,
            false,
            "events",
            "ALL",
          )}
          aria-current={selectedMode === "events" ? "page" : undefined}
        >
          {strings.events}
          <span>{events.length}</span>
        </Link>
      </nav>

      {selectedMode === "events" ? (
        <section
          className={styles.eventWorkspace}
          aria-labelledby="events-title"
        >
          <header className={styles.eventWorkspaceHeader}>
            <div>
              <p className={styles.eyebrow}>{strings.eventMode}</p>
              <h2 id="events-title">{strings.boothEvents}</h2>
              <p>{strings.eventIntro}</p>
            </div>
            <span>{strings.eventCount(events.length)}</span>
          </header>

          {events.length ? (
            <div className={styles.eventCards}>
              {events.map((event) => {
                const period = eventPeriod(event);
                return (
                  <article className={styles.eventCard} key={event.id}>
                    <div className={styles.eventCardSummary}>
                      <div>
                        <span
                          className={styles.eventPeriod}
                          data-period={period}
                        >
                          {strings.periodLabels[period]}
                        </span>
                        <h3>{event.name}</h3>
                        <p>
                          {formatEventRange(
                            event.startsAt,
                            event.endsAt,
                            locale,
                          )}
                        </p>
                      </div>
                      <strong>{strings.orderCount(event._count.orders)}</strong>
                    </div>
                    {canManageEvents ? (
                      <details className={styles.eventEdit}>
                        <summary>{strings.editEvent}</summary>
                        <EventEditor
                          boothId={boothId}
                          locale={locale}
                          event={{
                            id: event.id,
                            name: event.name,
                            startDate: eventDateInput(event.startsAt),
                            endDate: eventDateInput(event.endsAt, true),
                          }}
                        />
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className={styles.noEvents}>{strings.noEvents}</p>
          )}

          {canManageEvents ? (
            <details className={styles.createEvent} open={!events.length}>
              <summary>{strings.createEvent}</summary>
              <EventEditor boothId={boothId} locale={locale} />
            </details>
          ) : (
            <p className={styles.eventReadOnly}>{strings.eventOwnerOnly}</p>
          )}
        </section>
      ) : null}

      <section className={styles.filters} aria-labelledby="order-filters-title">
        <div className={styles.filterHeader}>
          <div>
            <h2 id="order-filters-title">
              {selectedMode === "events"
                ? strings.eventOrders
                : strings.orderQueue}
            </h2>
            <p>
              {selectedMode === "events"
                ? strings.eventFilterIntro
                : strings.queueFilterIntro}
            </p>
          </div>
          <span className={styles.resultCount} aria-live="polite">
            {strings.orderCount(filteredOrderCount)}
          </span>
        </div>

        {selectedMode === "events" ? (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{strings.eventLabel}</span>
            <nav
              className={styles.eventFilters}
              aria-label={strings.orderEventAria}
            >
              <Link
                href={buildOrdersHref(
                  boothId,
                  selectedStatus,
                  "all",
                  undefined,
                  false,
                  "events",
                  "ALL",
                )}
                className={styles.eventFilter}
                aria-current={selectedEvent === "ALL" ? "page" : undefined}
              >
                <span>{strings.allEvents}</span>
                <span className={styles.filterCount}>
                  {events.reduce(
                    (total, event) => total + event._count.orders,
                    0,
                  )}
                </span>
              </Link>
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={buildOrdersHref(
                    boothId,
                    selectedStatus,
                    "all",
                    undefined,
                    false,
                    "events",
                    event.id,
                  )}
                  className={styles.eventFilter}
                  aria-current={selectedEvent === event.id ? "page" : undefined}
                >
                  <span>{event.name}</span>
                  <span className={styles.filterCount}>
                    {event._count.orders}
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        ) : null}

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{strings.statusLabel}</span>
          <nav className={styles.statusFilters} aria-label={strings.statusAria}>
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
                    selectedMode,
                    selectedEvent,
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

        {selectedMode === "queue" ? (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{strings.placedLabel}</span>
            <nav
              className={styles.dateFilters}
              aria-label={strings.dateRangeAria}
            >
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
                {strings.today}
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
        ) : null}
      </section>

      {filteredOrderCount > 0 ? (
        <dl className={styles.metrics} aria-label={strings.summaryAria}>
          <div>
            <dt>{strings.ordersShown}</dt>
            <dd>{orders.length}</dd>
            <small>
              {strings.ordersShownHelp(
                firstVisible,
                lastVisible,
                filteredOrderCount,
              )}
            </small>
          </div>
          <div>
            <dt>{strings.pageValue}</dt>
            <dd>
              {formatMoney(pageValue, orders[0]?.currency ?? "VND", locale)}
            </dd>
            <small>{strings.pageValueHelp}</small>
          </div>
          <div>
            <dt>{strings.unitsRequested}</dt>
            <dd>{pageUnits}</dd>
            <small>{strings.unitsHelp}</small>
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
                {strings.showing(firstVisible, lastVisible, filteredOrderCount)}
              </p>
            </div>
            <span>{strings.rowsPerPage(PAGE_SIZE)}</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.orderTable}>
              <caption className={styles.srOnly}>
                {strings.tableCaption(
                  selectedMode === "events"
                    ? `${strings.eventLabel} / ${strings.statusLabel}`
                    : `${strings.statusLabel} / ${strings.placedLabel}`,
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{strings.orderColumn}</th>
                  <th scope="col">{strings.placedColumn}</th>
                  <th scope="col">{strings.itemsColumn}</th>
                  <th scope="col" className={styles.numericCell}>
                    {strings.totalColumn}
                  </th>
                  <th scope="col">{strings.statusColumn}</th>
                  <th scope="col">{strings.updateColumn}</th>
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
                      {order.event ? (
                        <span className={styles.eventAttribution}>
                          {order.event.name}
                        </span>
                      ) : null}
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
                      {formatDate(order.placedAt, locale)}
                    </td>
                    <td>
                      <OrderDetails order={order} locale={locale} />
                    </td>
                    <td className={styles.numericCell}>
                      <strong>
                        {formatMoney(order.totalCents, order.currency, locale)}
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
                        locale={locale}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={styles.mobileCards} aria-label={strings.ordersAria}>
            {orders.map((order) => (
              <li key={order.id} className={styles.mobileCard}>
                <div className={styles.mobileCardHeader}>
                  <div>
                    <span className={styles.orderCode}>{order.code}</span>
                    <strong>{order.customerName}</strong>
                    {order.event ? (
                      <span className={styles.eventAttribution}>
                        {order.event.name}
                      </span>
                    ) : null}
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
                    <dt>{strings.placedColumn}</dt>
                    <dd>{formatDate(order.placedAt, locale)}</dd>
                  </div>
                  <div>
                    <dt>{strings.totalColumn}</dt>
                    <dd>
                      {formatMoney(order.totalCents, order.currency, locale)}
                    </dd>
                  </div>
                </dl>
                <OrderDetails order={order} locale={locale} />
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
                  locale={locale}
                />
              </li>
            ))}
          </ul>

          <div className={styles.pagination}>
            <p>
              {strings.showing(firstVisible, lastVisible, filteredOrderCount)}{" "}
              {strings.matchingOrders}
            </p>
            <nav aria-label={strings.pagesAria}>
              {hasPreviousPage ? (
                <Link
                  href={buildOrdersHref(
                    boothId,
                    selectedStatus,
                    selectedDate,
                    currentPage - 1,
                    selectedToday,
                    selectedMode,
                    selectedEvent,
                  )}
                >
                  {strings.previous}
                </Link>
              ) : (
                <span aria-disabled="true">{strings.previous}</span>
              )}
              <strong>{strings.pageOf(currentPage, totalPages)}</strong>
              {hasNextPage ? (
                <Link
                  href={buildOrdersHref(
                    boothId,
                    selectedStatus,
                    selectedDate,
                    currentPage + 1,
                    selectedToday,
                    selectedMode,
                    selectedEvent,
                  )}
                >
                  {strings.next}
                </Link>
              ) : (
                <span aria-disabled="true">{strings.next}</span>
              )}
            </nav>
          </div>
        </section>
      ) : (
        <section className={styles.emptyState} aria-labelledby="empty-title">
          <span aria-hidden="true">◎</span>
          <div>
            <h2 id="empty-title">
              {isFirstUse ? strings.noOrdersTitle : strings.noMatchingTitle}
            </h2>
            <p>
              {isFirstUse
                ? strings.firstUseBody
                : selectedMode === "events"
                  ? events.length
                    ? strings.noEventMatchBody
                    : strings.noEventsBody
                  : strings.noMatchBody}
            </p>
            {isFirstUse ? null : (
              <Link
                className={styles.emptyAction}
                href={
                  selectedMode === "events"
                    ? buildOrdersHref(
                        boothId,
                        "ALL",
                        "all",
                        undefined,
                        false,
                        "events",
                        "ALL",
                      )
                    : buildOrdersHref(boothId, "ALL", "all")
                }
              >
                {strings.clearFilters}
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
  locale,
}: {
  locale: Locale;
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
      originalUnitPriceCents: bigint | null;
      promotionNameSnapshot: string | null;
      quantity: number;
    }>;
  };
}) {
  const strings = getWorkspaceStrings(locale).orders;
  const visibleItems = order.items.slice(0, 2);
  const unitCount = order.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  return (
    <div className={styles.itemList}>
      {visibleItems.map((item) => (
        <span key={item.id}>
          {parseBilingual(item.titleSnapshot, locale)}
          {item.variantSnapshot
            ? ` · ${parseBilingual(item.variantSnapshot, locale)}`
            : ""}{" "}
          ×{item.quantity}
          {item.promotionNameSnapshot
            ? ` · ${strings.promotionRewardShort}`
            : ""}
        </span>
      ))}
      {order.items.length > visibleItems.length ? (
        <small>
          {strings.moreLines(order.items.length - visibleItems.length)}
        </small>
      ) : null}
      <small>{strings.unitsRequestedCount(unitCount)}</small>
      <details className={styles.orderDetail}>
        <summary>{strings.viewFullOrder}</summary>
        <div className={styles.orderDetailBody}>
          <dl className={styles.orderDetailMeta}>
            <div>
              <dt>{strings.customer}</dt>
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
              <dt>{strings.transferMessage}</dt>
              <dd className={styles.referenceValue}>
                {order.transferReference}
              </dd>
            </div>
            <div>
              <dt>{strings.customerBankReference}</dt>
              <dd className={styles.referenceValue}>
                {order.customerTransferReference ?? strings.notSubmitted}
              </dd>
            </div>
            <div>
              <dt>{strings.timeline}</dt>
              <dd>
                {strings.timelinePlaced} {formatDate(order.placedAt, locale)}
              </dd>
              {order.expiresAt ? (
                <dd>
                  {strings.reservationLimit}{" "}
                  {formatDate(order.expiresAt, locale)}
                </dd>
              ) : null}
              {order.confirmedAt ? (
                <dd>
                  {strings.confirmed} {formatDate(order.confirmedAt, locale)}
                </dd>
              ) : null}
              {order.fulfilledAt ? (
                <dd>
                  {strings.fulfilled} {formatDate(order.fulfilledAt, locale)}
                </dd>
              ) : null}
            </div>
          </dl>

          <section
            className={styles.orderLines}
            aria-label={strings.completeItemsAria}
          >
            <h3>{strings.items}</h3>
            <ul>
              {order.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>
                      {parseBilingual(item.titleSnapshot, locale)}
                    </strong>
                    <span>
                      {item.variantSnapshot
                        ? parseBilingual(item.variantSnapshot, locale)
                        : strings.standardVariant}{" "}
                      · {item.quantity} ×{" "}
                      {formatMoney(item.unitPriceCents, order.currency, locale)}
                    </span>
                    {item.promotionNameSnapshot ? (
                      <span className={styles.promotionReward}>
                        {strings.promotionReward(
                          parseBilingual(item.promotionNameSnapshot, locale),
                        )}
                        {item.originalUnitPriceCents !== null
                          ? ` · ${strings.originalPrice(
                              formatMoney(
                                item.originalUnitPriceCents,
                                order.currency,
                                locale,
                              ),
                            )}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                  <strong>
                    {formatMoney(
                      item.unitPriceCents * BigInt(item.quantity),
                      order.currency,
                      locale,
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          {order.customerNote ? (
            <section
              className={styles.orderNote}
              aria-label={strings.customerNoteAria}
            >
              <h3>{strings.customerNote}</h3>
              <p>{order.customerNote}</p>
            </section>
          ) : null}

          <dl className={styles.orderTotals}>
            <div>
              <dt>{strings.subtotal}</dt>
              <dd>
                {formatMoney(order.subtotalCents, order.currency, locale)}
              </dd>
            </div>
            {order.subtotalCents > order.totalCents ? (
              <div className={styles.promotionSavings}>
                <dt>{strings.promotionSavings}</dt>
                <dd>
                  −
                  {formatMoney(
                    order.subtotalCents - order.totalCents,
                    order.currency,
                    locale,
                  )}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{strings.orderTotal}</dt>
              <dd>{formatMoney(order.totalCents, order.currency, locale)}</dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}
