import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ORDER_RESERVATION_TTL_MS } from "@/lib/order-inventory";
import {
  orderShipmentSchema,
  type OrderShipmentInput,
} from "@/lib/order-fulfillment";
import {
  canTransitionOrderStatus,
  readOrderPaymentSnapshot,
  type OrderStatusName,
  releasesInventory,
} from "@/lib/order-rules";
import { synchronizeProductInventoryStatusForVariants } from "@/lib/product-inventory";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const orderDetailSelect = {
  id: true,
  boothId: true,
  code: true,
  status: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  customerSocialContact: true,
  customerNote: true,
  fulfillmentMethod: true,
  shippingAddress: true,
  shipmentCarrier: true,
  shipmentTrackingNumber: true,
  shipmentTrackingUrl: true,
  customerTransferReference: true,
  subtotalCents: true,
  totalCents: true,
  currency: true,
  transferReference: true,
  paymentSnapshot: true,
  placedAt: true,
  expiresAt: true,
  confirmedAt: true,
  fulfilledAt: true,
  updatedAt: true,
  event: {
    select: { id: true, name: true },
  },
  items: {
    select: {
      id: true,
      productId: true,
      productVariantId: true,
      titleSnapshot: true,
      variantSnapshot: true,
      unitPriceCents: true,
      originalUnitPriceCents: true,
      promotionNameSnapshot: true,
      quantity: true,
    },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.OrderSelect;

type OrderDetailRecord = Prisma.OrderGetPayload<{
  select: typeof orderDetailSelect;
}>;

export type OrderDetailDto = ReturnType<typeof toOrderDetailDto>;

export type OrderReceiptState = "AWAITING_REVIEW" | "CONFIRMED" | "CLOSED";

export type OrderReceiptDto = {
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatusName;
  paymentState: OrderReceiptState;
  customerName: string;
  customerEmail: string;
  amountCents: string;
  currency: string;
  paymentMethod: string | null;
  timestamp: string;
  customerTransferReference: string | null;
};

export type OrderReceiptHistoryEntry = {
  id: string;
  orderStatus: OrderStatusName;
  amountCents: string;
  currency: string;
  paymentMethod: string | null;
  timestamp: string;
  actorName: string | null;
  kind: "PLACED" | "STATUS_CHANGED";
};

const managerRoles = ["OWNER", "ADMIN"] as const;
const orderDeskRoles = ["OWNER", "ADMIN", "STAFF"] as const;
const receiptAuditActions = [
  "order.pending",
  "order.confirmed",
  "order.fulfilled",
  "order.cancelled",
  "order.expired",
] as const;

function receiptState(status: OrderStatusName): OrderReceiptState {
  if (status === "PENDING") return "AWAITING_REVIEW";
  if (status === "CONFIRMED" || status === "FULFILLED") return "CONFIRMED";
  return "CLOSED";
}

function receiptTimestamp(order: {
  status: OrderStatusName;
  placedAt: Date;
  confirmedAt: Date | null;
  fulfilledAt: Date | null;
  updatedAt: Date;
}) {
  if (order.status === "CONFIRMED") return order.confirmedAt ?? order.updatedAt;
  if (order.status === "FULFILLED") {
    return order.fulfilledAt ?? order.confirmedAt ?? order.updatedAt;
  }
  if (order.status === "CANCELLED" || order.status === "EXPIRED") {
    return order.updatedAt;
  }
  return order.placedAt;
}

export function projectOrderReceipt(order: {
  id: string;
  code: string;
  status: OrderStatusName;
  customerName: string;
  customerEmail: string;
  totalCents: bigint;
  currency: string;
  paymentSnapshot: unknown;
  customerTransferReference: string | null;
  placedAt: Date;
  confirmedAt: Date | null;
  fulfilledAt: Date | null;
  updatedAt: Date;
}): OrderReceiptDto {
  return {
    orderId: order.id,
    orderCode: order.code,
    orderStatus: order.status,
    paymentState: receiptState(order.status),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    amountCents: order.totalCents.toString(),
    currency: order.currency,
    paymentMethod:
      readOrderPaymentSnapshot(order.paymentSnapshot)?.paymentLabel ?? null,
    timestamp: receiptTimestamp(order).toISOString(),
    customerTransferReference: order.customerTransferReference,
  };
}

function toOrderDetailDto(order: OrderDetailRecord) {
  return {
    ...order,
    subtotalCents: order.subtotalCents.toString(),
    totalCents: order.totalCents.toString(),
    placedAt: order.placedAt.toISOString(),
    expiresAt: order.expiresAt?.toISOString() ?? null,
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({
      ...item,
      unitPriceCents: item.unitPriceCents.toString(),
      originalUnitPriceCents: item.originalUnitPriceCents?.toString() ?? null,
    })),
  };
}

async function readOrderDetailForRoles(
  input: {
    boothId: string;
    orderId: string;
    actorUserId: string;
  },
  roles: readonly ("OWNER" | "ADMIN" | "STAFF")[],
) {
  const roleFilter = [...roles];
  const membership = await db.boothMembership.findFirst({
    where: {
      boothId: input.boothId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: roleFilter },
    },
    select: { id: true },
  });
  if (!membership) return { kind: "forbidden" } as const;

  const order = await db.order.findFirst({
    where: {
      id: input.orderId,
      boothId: input.boothId,
      booth: {
        memberships: {
          some: {
            userId: input.actorUserId,
            status: "ACTIVE",
            role: { in: roleFilter },
          },
        },
      },
    },
    select: orderDetailSelect,
  });
  if (!order) return { kind: "missing" } as const;

  const audits = await db.auditLog.findMany({
    where: {
      boothId: input.boothId,
      entityType: "Order",
      entityId: input.orderId,
      action: { in: [...receiptAuditActions] },
    },
    select: {
      id: true,
      action: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const paymentMethod =
    readOrderPaymentSnapshot(order.paymentSnapshot)?.paymentLabel ?? null;
  const receiptHistory: OrderReceiptHistoryEntry[] = [
    {
      id: `${order.id}:placed`,
      orderStatus: "PENDING",
      amountCents: order.totalCents.toString(),
      currency: order.currency,
      paymentMethod,
      timestamp: order.placedAt.toISOString(),
      actorName: null,
      kind: "PLACED",
    },
    ...audits.flatMap((audit) => {
      const status = audit.action.slice("order.".length).toUpperCase();
      if (
        !["PENDING", "CONFIRMED", "FULFILLED", "CANCELLED", "EXPIRED"].includes(
          status,
        )
      ) {
        return [];
      }
      return [
        {
          id: audit.id,
          orderStatus: status as OrderStatusName,
          amountCents: order.totalCents.toString(),
          currency: order.currency,
          paymentMethod,
          timestamp: audit.createdAt.toISOString(),
          actorName: audit.actor.name,
          kind: "STATUS_CHANGED" as const,
        },
      ];
    }),
  ];

  return {
    kind: "found",
    order: toOrderDetailDto(order),
    receiptHistory,
  } as const;
}

export function readOrderDetailForMember(input: {
  boothId: string;
  orderId: string;
  actorUserId: string;
}) {
  return readOrderDetailForRoles(input, orderDeskRoles);
}

export function readOrderDetailForManager(input: {
  boothId: string;
  orderId: string;
  actorUserId: string;
}) {
  return readOrderDetailForRoles(input, managerRoles);
}

async function hasManagerMembership(input: {
  boothId: string;
  actorUserId: string;
}) {
  return db.boothMembership.findFirst({
    where: {
      boothId: input.boothId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: [...managerRoles] },
    },
    select: { id: true },
  });
}

export async function readPaymentReceiptsForManager(input: {
  boothId: string;
  actorUserId: string;
}) {
  if (!(await hasManagerMembership(input))) {
    return { kind: "forbidden" } as const;
  }
  const orders = await db.order.findMany({
    where: {
      boothId: input.boothId,
      booth: {
        memberships: {
          some: {
            userId: input.actorUserId,
            status: "ACTIVE",
            role: { in: [...managerRoles] },
          },
        },
      },
    },
    select: {
      id: true,
      code: true,
      status: true,
      customerName: true,
      customerEmail: true,
      customerTransferReference: true,
      totalCents: true,
      currency: true,
      paymentSnapshot: true,
      placedAt: true,
      confirmedAt: true,
      fulfilledAt: true,
      updatedAt: true,
    },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
  });
  return {
    kind: "found",
    receipts: orders.map((order) => projectOrderReceipt(order)),
  } as const;
}

export async function readShippingOrdersForManager(input: {
  boothId: string;
  actorUserId: string;
}) {
  if (!(await hasManagerMembership(input))) {
    return { kind: "forbidden" } as const;
  }
  const orders = await db.order.findMany({
    where: {
      boothId: input.boothId,
      fulfillmentMethod: "SHIP",
      booth: {
        memberships: {
          some: {
            userId: input.actorUserId,
            status: "ACTIVE",
            role: { in: [...managerRoles] },
          },
        },
      },
    },
    select: {
      id: true,
      code: true,
      status: true,
      customerName: true,
      shippingAddress: true,
      shipmentCarrier: true,
      shipmentTrackingNumber: true,
      placedAt: true,
    },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
  });
  return {
    kind: "found",
    orders: orders.map((order) => ({
      ...order,
      placedAt: order.placedAt.toISOString(),
    })),
  } as const;
}

export async function saveOrderShipment(input: {
  boothId: string;
  orderId: string;
  actorUserId: string;
  shipment: OrderShipmentInput;
}) {
  const parsed = orderShipmentSchema.safeParse(input.shipment);
  if (!parsed.success) return { kind: "invalid" } as const;

  return db.$transaction(
    async (transaction) => {
      const membership = await transaction.boothMembership.findFirst({
        where: {
          boothId: input.boothId,
          userId: input.actorUserId,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN"] },
        },
        select: { id: true },
      });
      if (!membership) return { kind: "forbidden" } as const;

      const order = await transaction.order.findFirst({
        where: { id: input.orderId, boothId: input.boothId },
        select: { fulfillmentMethod: true },
      });
      if (!order) return { kind: "missing" } as const;
      if (order.fulfillmentMethod !== "SHIP") {
        return { kind: "not-shipping" } as const;
      }

      const shipment = parsed.data;
      const updated = await transaction.order.updateMany({
        where: {
          id: input.orderId,
          boothId: input.boothId,
          fulfillmentMethod: "SHIP",
          booth: {
            memberships: {
              some: {
                userId: input.actorUserId,
                status: "ACTIVE",
                role: { in: ["OWNER", "ADMIN"] },
              },
            },
          },
        },
        data: {
          shipmentCarrier: shipment.carrier,
          shipmentTrackingNumber: shipment.trackingNumber,
          shipmentTrackingUrl: shipment.trackingUrl,
        },
      });
      if (!updated.count) return { kind: "conflict" } as const;
      await transaction.auditLog.create({
        data: {
          boothId: input.boothId,
          actorUserId: input.actorUserId,
          action: "order.shipment_updated",
          entityType: "Order",
          entityId: input.orderId,
          metadata: {
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: shipment.trackingUrl,
            manualTracking: true,
          },
        },
      });

      return { kind: "updated", shipment } as const;
    },
    { isolationLevel: "Serializable" },
  );
}

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
      fulfillmentMethod: true,
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
        fulfillmentMethod: order.fulfillmentMethod,
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
