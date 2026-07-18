import Link from "next/link";
import {
  MetricCard,
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import { updateOrderStatusAction } from "../actions";

const statuses = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "FULFILLED",
] as const;

const formatMoney = (priceCents: number, currency: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { boothId } = await params;
  const { status } = await searchParams;
  await requireBoothMember(boothId);
  const selectedStatus = statuses.includes(status as (typeof statuses)[number])
    ? (status as (typeof statuses)[number])
    : "PENDING";

  const [orders, grouped, totalPending] = await Promise.all([
    db.order.findMany({
      where: { boothId, status: selectedStatus },
      include: { items: true },
      orderBy: { placedAt: "desc" },
      take: 100,
    }),
    db.order.groupBy({
      by: ["status"],
      where: { boothId },
      _count: true,
    }),
    db.order.aggregate({
      where: { boothId, status: "PENDING" },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const counts = new Map(grouped.map((entry) => [entry.status, entry._count]));
  const units = orders.reduce(
    (total, order) =>
      total + order.items.reduce((sum, item) => sum + item.quantity, 0),
    0,
  );

  return (
    <>
      <PageHeading
        eyebrow="Live operations"
        title="Orders"
        description="Review reservations, manually confirm transfers, and prepare fulfilment."
        actions={
          <>
            <span className={styles.pill}>{totalPending._count} pending</span>
            <span className={styles.pill}>Manual review only</span>
          </>
        }
      />

      <div className={styles.filterRow} aria-label="Order statuses">
        {statuses.map((entry) => (
          <Link
            key={entry}
            className={styles.tab}
            href={`/manage/${boothId}/orders?status=${entry}`}
            aria-current={entry === selectedStatus ? "page" : undefined}
          >
            {entry.toLocaleLowerCase()} {counts.get(entry) ?? 0}
          </Link>
        ))}
      </div>

      <div className={styles.metrics}>
        <MetricCard
          icon="▧"
          label="Orders shown"
          value={orders.length}
          detail={`${orders.length} matching orders`}
        />
        <MetricCard
          icon="◇"
          label="Pending value"
          value={formatMoney(totalPending._sum.totalCents ?? 0, "VND")}
          detail="Not automatically verified"
        />
        <MetricCard
          icon="□"
          label="Units requested"
          value={units}
          detail="Current filtered queue"
        />
      </div>

      <p className={styles.eyebrow}>Order queue</p>
      {orders.length ? (
        <ul className={styles.orderList}>
          {orders.map((order) => (
            <li className={styles.orderCard} key={order.id}>
              <div>
                <strong>
                  {order.code} · {order.customerName}
                </strong>
                <small>
                  {order.items.length} lines ·{" "}
                  {formatMoney(order.totalCents, order.currency)} ·{" "}
                  {order.placedAt.toLocaleString("en-GB")}
                </small>
                <small>{order.customerEmail}</small>
              </div>
              <div className={styles.inlineActions}>
                <span className={styles.statusBadge} data-status={order.status}>
                  {order.status.toLocaleLowerCase()}
                </span>
                <form action={updateOrderStatusAction}>
                  <input type="hidden" name="boothId" value={boothId} />
                  <input type="hidden" name="orderId" value={order.id} />
                  <select
                    className={styles.searchInput}
                    name="status"
                    defaultValue={order.status}
                    aria-label={`Update ${order.code} status`}
                  >
                    {statuses.map((entry) => (
                      <option value={entry} key={entry}>
                        {entry.toLocaleLowerCase()}
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    className={styles.button}
                    pendingLabel="Updating…"
                  >
                    Update manually
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>
          <div>
            <span className={styles.emptyIcon} aria-hidden="true">
              ▱
            </span>
            <h2>No {selectedStatus.toLocaleLowerCase()} orders</h2>
            <p>
              New reservations will appear here. Bank transfers are reviewed by
              booth staff outside Cyfurden and are never confirmed
              automatically.
            </p>
            <Link className={styles.button} href={`/manage/${boothId}/orders`}>
              View pending orders
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
