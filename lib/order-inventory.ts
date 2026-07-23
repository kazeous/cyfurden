import { db } from "@/lib/db";

export const ORDER_RESERVATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function expireStaleOrdersInTransaction(
  transaction: TransactionClient,
  boothId: string,
  now: Date,
) {
  const staleOrders = await transaction.order.findMany({
    where: {
      boothId,
      status: "PENDING",
      expiresAt: { not: null, lte: now },
    },
    select: {
      id: true,
      items: {
        select: {
          productVariantId: true,
          quantity: true,
          inventoryDebited: true,
        },
      },
    },
  });

  let expiredCount = 0;
  for (const order of staleOrders) {
    const expired = await transaction.order.updateMany({
      where: { id: order.id, boothId, status: "PENDING" },
      data: { status: "EXPIRED", expiresAt: now },
    });
    if (!expired.count) continue;

    for (const item of order.items) {
      if (!item.inventoryDebited || !item.productVariantId) continue;
      await transaction.productVariant.updateMany({
        where: {
          id: item.productVariantId,
          stockQuantity: { not: null },
        },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }
    await transaction.orderItem.updateMany({
      where: { orderId: order.id, inventoryDebited: true },
      data: { inventoryDebited: false },
    });
    expiredCount += 1;
  }

  return expiredCount;
}

export async function expireStaleOrders(boothId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        (transaction) =>
          expireStaleOrdersInTransaction(transaction, boothId, new Date()),
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const isSerializationConflict =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2034";
      if (!isSerializationConflict || attempt === 2) throw error;
    }
  }
  return 0;
}
