import { db } from "@/lib/db";
import { ORDER_RESERVATION_TTL_MS } from "@/lib/order-inventory";
import {
  canTransitionOrderStatus,
  type OrderStatusName,
  releasesInventory,
} from "@/lib/order-rules";
import { synchronizeProductInventoryStatusForVariants } from "@/lib/product-inventory";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type OrderTransitionResult =
  | { kind: "missing" }
  | { kind: "conflict" }
  | {
      kind: "unchanged";
      code: string;
      currentStatus: OrderStatusName;
    }
  | {
      kind: "invalid-transition";
      code: string;
      currentStatus: OrderStatusName;
    }
  | {
      kind: "changed";
      code: string;
      previousStatus: OrderStatusName;
      nextStatus: OrderStatusName;
      inventoryReleased: boolean;
    };

async function transitionOrderStatusInTransaction(
  transaction: TransactionClient,
  input: {
    boothId: string;
    orderId: string;
    actorUserId: string;
    nextStatus: OrderStatusName;
  },
): Promise<OrderTransitionResult> {
  const order = await transaction.order.findFirst({
    where: { id: input.orderId, boothId: input.boothId },
    select: {
      code: true,
      status: true,
      confirmedAt: true,
      confirmedById: true,
      items: {
        select: {
          id: true,
          productVariantId: true,
          quantity: true,
          inventoryDebited: true,
        },
      },
    },
  });

  if (!order) return { kind: "missing" };

  const currentStatus = order.status as OrderStatusName;
  if (currentStatus === input.nextStatus) {
    return { kind: "unchanged", code: order.code, currentStatus };
  }
  if (!canTransitionOrderStatus(currentStatus, input.nextStatus)) {
    return {
      kind: "invalid-transition",
      code: order.code,
      currentStatus,
    };
  }

  const now = new Date();
  const keepsConfirmation =
    input.nextStatus === "CONFIRMED" || input.nextStatus === "FULFILLED";
  const expiresAt =
    input.nextStatus === "EXPIRED"
      ? now
      : input.nextStatus === "PENDING"
        ? new Date(now.getTime() + ORDER_RESERVATION_TTL_MS)
        : null;
  const updated = await transaction.order.updateMany({
    where: {
      id: input.orderId,
      boothId: input.boothId,
      status: currentStatus,
    },
    data: {
      status: input.nextStatus,
      confirmedAt: keepsConfirmation ? (order.confirmedAt ?? now) : null,
      confirmedById: keepsConfirmation
        ? (order.confirmedById ?? input.actorUserId)
        : null,
      fulfilledAt: input.nextStatus === "FULFILLED" ? now : null,
      expiresAt,
    },
  });
  if (!updated.count) return { kind: "conflict" };

  let inventoryReleased = false;
  const restoredVariantIds = new Set<string>();
  if (releasesInventory(input.nextStatus)) {
    for (const item of order.items) {
      if (!item.inventoryDebited || !item.productVariantId) continue;
      const restored = await transaction.productVariant.updateMany({
        where: {
          id: item.productVariantId,
          stockQuantity: { not: null },
        },
        data: { stockQuantity: { increment: item.quantity } },
      });
      if (restored.count) {
        restoredVariantIds.add(item.productVariantId);
        inventoryReleased = true;
      }
    }
    await transaction.orderItem.updateMany({
      where: { orderId: input.orderId, inventoryDebited: true },
      data: { inventoryDebited: false },
    });
    await synchronizeProductInventoryStatusForVariants(
      transaction,
      restoredVariantIds,
      { restoreSoldOut: true },
    );
  }

  await transaction.auditLog.create({
    data: {
      boothId: input.boothId,
      actorUserId: input.actorUserId,
      action: `order.${input.nextStatus.toLocaleLowerCase()}`,
      entityType: "Order",
      entityId: input.orderId,
      metadata: {
        manualReview: true,
        previousStatus: currentStatus,
        nextStatus: input.nextStatus,
        inventoryReleased,
      },
    },
  });

  return {
    kind: "changed",
    code: order.code,
    previousStatus: currentStatus,
    nextStatus: input.nextStatus,
    inventoryReleased,
  };
}

const isSerializationConflict = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "P2034";

export async function transitionOrderStatus(input: {
  boothId: string;
  orderId: string;
  actorUserId: string;
  nextStatus: OrderStatusName;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        (transaction) => transitionOrderStatusInTransaction(transaction, input),
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === 2) throw error;
    }
  }

  return { kind: "conflict" } as const;
}
