import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { transitionOrderStatus } from "../lib/order-admin";
import { expireStaleOrders } from "../lib/order-inventory";
import { db } from "../lib/db";

const enabled = process.env.CYFURDEN_PHASE5_INTEGRATION === "1";

test(
  "Phase 5 confirms, cancels, expires, audits, and releases inventory exactly once",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase5-user-${suffix}`;
    const userEmail = `phase5-${suffix}@example.com`;
    let boothId: string | null = null;

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase Five Staff",
          email: userEmail,
          emailVerified: true,
        },
      });
      const booth = await db.booth.create({
        data: {
          slug: `phase5-${suffix.slice(0, 16)}`,
          name: "Phase Five Booth",
          status: "PUBLISHED",
          ownerId: userId,
          memberships: {
            create: { userId, role: "STAFF", status: "ACTIVE" },
          },
        },
      });
      boothId = booth.id;

      const cancellableProduct = await db.product.create({
        data: {
          boothId,
          slug: "cancellable-pin",
          sku: `P5-CANCEL-${suffix.slice(0, 8)}`,
          name: "Cancellable Pin",
          description: "Reserved inventory for a manual status transition.",
          priceCents: BigInt(12_500_00),
          status: "LIVE",
          variants: {
            create: {
              sku: `P5-CANCEL-V-${suffix.slice(0, 8)}`,
              label: "Standard",
              status: "LOW_STOCK",
              stockQuantity: 1,
            },
          },
        },
        include: { variants: true },
      });
      const cancellableVariant = cancellableProduct.variants[0];
      assert.ok(cancellableVariant);

      const pending = await db.order.create({
        data: {
          boothId,
          code: `P5-C-${suffix.slice(0, 16)}`,
          status: "PENDING",
          customerName: "Manual Review Customer",
          customerEmail: "manual-review@example.com",
          customerPhone: "0900000001",
          customerNote: "Pickup after 14:00",
          customerTransferReference: "BANK-TRACE-PHASE5",
          subtotalCents: BigInt(25_000_00),
          totalCents: BigInt(25_000_00),
          transferReference: `P5-C-${suffix.slice(0, 16)}`,
          idempotencyKey: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          items: {
            create: {
              productId: cancellableProduct.id,
              productVariantId: cancellableVariant.id,
              titleSnapshot: cancellableProduct.name,
              variantSnapshot: cancellableVariant.label,
              unitPriceCents: BigInt(12_500_00),
              quantity: 2,
              inventoryDebited: true,
            },
          },
        },
      });

      const confirmed = await transitionOrderStatus({
        boothId,
        orderId: pending.id,
        actorUserId: userId,
        nextStatus: "CONFIRMED",
      });
      assert.equal(confirmed.kind, "changed");
      const confirmedOrder = await db.order.findUniqueOrThrow({
        where: { id: pending.id },
      });
      assert.equal(confirmedOrder.status, "CONFIRMED");
      assert.ok(confirmedOrder.confirmedAt);
      assert.equal(confirmedOrder.confirmedById, userId);
      assert.equal(confirmedOrder.expiresAt, null);
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: cancellableVariant.id },
          })
        ).stockQuantity,
        1,
      );

      const invalid = await transitionOrderStatus({
        boothId,
        orderId: pending.id,
        actorUserId: userId,
        nextStatus: "EXPIRED",
      });
      assert.equal(invalid.kind, "invalid-transition");

      const returnedToReview = await transitionOrderStatus({
        boothId,
        orderId: pending.id,
        actorUserId: userId,
        nextStatus: "PENDING",
      });
      assert.equal(returnedToReview.kind, "changed");
      const reopenedOrder = await db.order.findUniqueOrThrow({
        where: { id: pending.id },
      });
      assert.equal(reopenedOrder.status, "PENDING");
      assert.equal(reopenedOrder.confirmedAt, null);
      assert.equal(reopenedOrder.confirmedById, null);
      assert.ok(
        reopenedOrder.expiresAt && reopenedOrder.expiresAt > new Date(),
      );

      const reconfirmed = await transitionOrderStatus({
        boothId,
        orderId: pending.id,
        actorUserId: userId,
        nextStatus: "CONFIRMED",
      });
      assert.equal(reconfirmed.kind, "changed");

      const cancelled = await transitionOrderStatus({
        boothId,
        orderId: pending.id,
        actorUserId: userId,
        nextStatus: "CANCELLED",
      });
      assert.equal(cancelled.kind, "changed");
      assert.equal(
        cancelled.kind === "changed" && cancelled.inventoryReleased,
        true,
      );
      const cancelledOrder = await db.order.findUniqueOrThrow({
        where: { id: pending.id },
        include: { items: true },
      });
      assert.equal(cancelledOrder.status, "CANCELLED");
      assert.equal(cancelledOrder.confirmedAt, null);
      assert.equal(cancelledOrder.confirmedById, null);
      assert.equal(cancelledOrder.items[0]?.inventoryDebited, false);
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: cancellableVariant.id },
          })
        ).stockQuantity,
        3,
      );

      const unchanged = await transitionOrderStatus({
        boothId,
        orderId: pending.id,
        actorUserId: userId,
        nextStatus: "CANCELLED",
      });
      assert.equal(unchanged.kind, "unchanged");
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: cancellableVariant.id },
          })
        ).stockQuantity,
        3,
      );

      const fulfillableOrder = await db.order.create({
        data: {
          boothId,
          code: `P5-F-${suffix.slice(0, 16)}`,
          status: "PENDING",
          customerName: "Fulfilment Customer",
          customerEmail: "fulfilment@example.com",
          subtotalCents: BigInt(12_500_00),
          totalCents: BigInt(12_500_00),
          transferReference: `P5-F-${suffix.slice(0, 16)}`,
          idempotencyKey: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          items: {
            create: {
              productId: cancellableProduct.id,
              productVariantId: cancellableVariant.id,
              titleSnapshot: cancellableProduct.name,
              variantSnapshot: cancellableVariant.label,
              unitPriceCents: BigInt(12_500_00),
              quantity: 1,
              inventoryDebited: true,
            },
          },
        },
      });

      const wrongBooth = await transitionOrderStatus({
        boothId: `${boothId}-other`,
        orderId: fulfillableOrder.id,
        actorUserId: userId,
        nextStatus: "CONFIRMED",
      });
      assert.equal(wrongBooth.kind, "missing");

      const fulfillableConfirmed = await transitionOrderStatus({
        boothId,
        orderId: fulfillableOrder.id,
        actorUserId: userId,
        nextStatus: "CONFIRMED",
      });
      assert.equal(fulfillableConfirmed.kind, "changed");
      const beforeFulfilment = await db.order.findUniqueOrThrow({
        where: { id: fulfillableOrder.id },
      });
      assert.ok(beforeFulfilment.confirmedAt);
      assert.equal(beforeFulfilment.confirmedById, userId);

      const fulfilled = await transitionOrderStatus({
        boothId,
        orderId: fulfillableOrder.id,
        actorUserId: userId,
        nextStatus: "FULFILLED",
      });
      assert.equal(fulfilled.kind, "changed");
      assert.equal(
        fulfilled.kind === "changed" && fulfilled.inventoryReleased,
        false,
      );
      const fulfilledOrder = await db.order.findUniqueOrThrow({
        where: { id: fulfillableOrder.id },
        include: { items: true },
      });
      assert.equal(fulfilledOrder.status, "FULFILLED");
      assert.equal(
        fulfilledOrder.confirmedAt?.getTime(),
        beforeFulfilment.confirmedAt?.getTime(),
      );
      assert.equal(fulfilledOrder.confirmedById, userId);
      assert.ok(fulfilledOrder.fulfilledAt);
      assert.equal(fulfilledOrder.items[0]?.inventoryDebited, true);
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: cancellableVariant.id },
          })
        ).stockQuantity,
        3,
      );

      const fulfilledCannotCancel = await transitionOrderStatus({
        boothId,
        orderId: fulfillableOrder.id,
        actorUserId: userId,
        nextStatus: "CANCELLED",
      });
      assert.equal(fulfilledCannotCancel.kind, "invalid-transition");

      const fulfilmentAuditLogs = await db.auditLog.findMany({
        where: { boothId, entityId: fulfillableOrder.id },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        fulfilmentAuditLogs.map((entry) => entry.action),
        ["order.confirmed", "order.fulfilled"],
      );

      const staleProduct = await db.product.create({
        data: {
          boothId,
          slug: "stale-sticker",
          sku: `P5-STALE-${suffix.slice(0, 8)}`,
          name: "Stale Sticker",
          description: "A reservation that should expire lazily.",
          priceCents: BigInt(5_000_00),
          status: "SOLD_OUT",
          variants: {
            create: {
              sku: `P5-STALE-V-${suffix.slice(0, 8)}`,
              label: "Standard",
              status: "AVAILABLE",
              stockQuantity: 0,
            },
          },
        },
        include: { variants: true },
      });
      const staleVariant = staleProduct.variants[0];
      assert.ok(staleVariant);
      const staleOrder = await db.order.create({
        data: {
          boothId,
          code: `P5-E-${suffix.slice(0, 16)}`,
          customerName: "Expired Customer",
          customerEmail: "expired@example.com",
          subtotalCents: BigInt(5_000_00),
          totalCents: BigInt(5_000_00),
          transferReference: `P5-E-${suffix.slice(0, 16)}`,
          idempotencyKey: randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
          items: {
            create: {
              productId: staleProduct.id,
              productVariantId: staleVariant.id,
              titleSnapshot: staleProduct.name,
              variantSnapshot: staleVariant.label,
              unitPriceCents: BigInt(5_000_00),
              quantity: 1,
              inventoryDebited: true,
            },
          },
        },
      });

      assert.equal(await expireStaleOrders(boothId), 1);
      const expiredOrder = await db.order.findUniqueOrThrow({
        where: { id: staleOrder.id },
        include: { items: true },
      });
      assert.equal(expiredOrder.status, "EXPIRED");
      assert.equal(expiredOrder.items[0]?.inventoryDebited, false);
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: staleVariant.id },
          })
        ).stockQuantity,
        1,
      );
      assert.equal(
        (
          await db.product.findUniqueOrThrow({
            where: { id: staleProduct.id },
          })
        ).status,
        "LIVE",
      );
      assert.equal(await expireStaleOrders(boothId), 0);

      const auditLogs = await db.auditLog.findMany({
        where: { boothId, entityId: pending.id },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        auditLogs.map((entry) => entry.action),
        [
          "order.confirmed",
          "order.pending",
          "order.confirmed",
          "order.cancelled",
        ],
      );
      assert.equal(
        (
          auditLogs[3]?.metadata as {
            inventoryReleased?: unknown;
          }
        ).inventoryReleased,
        true,
      );
    } finally {
      if (boothId) {
        await db.order.deleteMany({ where: { boothId } });
        await db.booth.deleteMany({ where: { id: boothId } });
      }
      await db.user.deleteMany({ where: { id: userId } });
    }
  },
);
