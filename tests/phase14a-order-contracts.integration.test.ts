import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createPublicOrderAction,
  type PublicOrderState,
} from "../app/s/[slug]/actions";
import { db } from "../lib/db";
import {
  readOrderDetailForManager,
  readOrderDetailForMember,
  readPaymentReceiptsForManager,
  readShippingOrdersForManager,
  saveOrderShipment,
  transitionOrderStatus,
} from "../lib/order-admin";
import { readPublicReservation } from "../lib/public-reservation";
import { createDefaultStorefrontDocument } from "../lib/storefront-document";

const enabled = process.env.CYFURDEN_PHASE14_INTEGRATION === "1";

function orderForm(input: {
  boothId: string;
  slug: string;
  productId: string;
  variantId: string;
  fulfillmentMethod: "PICKUP" | "SHIP";
  shippingAddress?: string;
  customerPhone?: string;
  customerSocialContact?: string;
}) {
  const form = new FormData();
  form.set("boothId", input.boothId);
  form.set("slug", input.slug);
  form.set("idempotencyKey", randomUUID());
  form.set("customerName", "Phase Fourteen Customer");
  form.set("customerEmail", "phase14-customer@example.com");
  form.set("customerPhone", input.customerPhone ?? "0901234567");
  form.set(
    "customerSocialContact",
    input.customerSocialContact ?? " @phase-fourteen ",
  );
  form.set("fulfillmentMethod", input.fulfillmentMethod);
  form.set("shippingAddress", input.shippingAddress ?? "");
  form.set("customerNote", "Phase 14A acceptance");
  form.set(
    "lines",
    JSON.stringify([
      {
        productId: input.productId,
        variantId: input.variantId,
        quantity: 1,
      },
    ]),
  );
  return form;
}

async function expectReservationRedirect(
  action: () => Promise<PublicOrderState>,
) {
  try {
    await action();
    assert.fail("the successful reservation should redirect");
  } catch (error) {
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest: unknown }).digest)
        : "";
    assert.match(digest, /^NEXT_REDIRECT;/);
  }
}

test(
  "Phase 14A preserves legacy orders and enforces fulfillment, contact, reference, and booth scope",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `phase14-owner-${suffix}`;
    const staffId = `phase14-staff-${suffix}`;
    const strangerId = `phase14-stranger-${suffix}`;
    const slug = `phase14-${suffix.slice(0, 16)}`;
    let boothId: string | null = null;
    let secondBoothId: string | null = null;

    try {
      await db.user.createMany({
        data: [
          {
            id: ownerId,
            name: "Phase Fourteen Owner",
            email: `phase14-owner-${suffix}@example.com`,
            emailVerified: true,
          },
          {
            id: staffId,
            name: "Phase Fourteen Staff",
            email: `phase14-staff-${suffix}@example.com`,
            emailVerified: true,
          },
          {
            id: strangerId,
            name: "Phase Fourteen Stranger",
            email: `phase14-stranger-${suffix}@example.com`,
            emailVerified: true,
          },
        ],
      });
      const booth = await db.booth.create({
        data: {
          slug,
          name: "Phase Fourteen Booth",
          status: "PUBLISHED",
          ownerId,
          memberships: {
            create: [
              { userId: ownerId, role: "OWNER", status: "ACTIVE" },
              { userId: staffId, role: "STAFF", status: "ACTIVE" },
            ],
          },
        },
      });
      boothId = booth.id;
      const secondBooth = await db.booth.create({
        data: {
          slug: `${slug}-other`,
          name: "Phase Fourteen Other Booth",
          ownerId,
          memberships: {
            create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      secondBoothId = secondBooth.id;
      const document = createDefaultStorefrontDocument(booth.name);
      await db.storefrontConfig.create({
        data: {
          boothId,
          draftDocument: document,
          publishedDocument: document,
          publishedAt: new Date(),
          updatedById: ownerId,
        },
      });
      await db.boothPaymentInstruction.create({
        data: {
          boothId,
          bankName: "VietQR Test Bank",
          bankCode: "970415",
          accountName: "CYFURDEN STUDIO",
          accountNumber: "0123456789",
          transferReferenceTemplate: "ORDER {code} {item} {amount}",
          instructions: "Transfer the exact amount.",
          disclaimer: "The booth reviews every transfer manually.",
        },
      });
      const product = await db.product.create({
        data: {
          boothId,
          slug: "phase-fourteen-product",
          sku: `P14-${suffix.slice(0, 8)}`,
          name: "Phase Fourteen Product",
          description: "Order contract acceptance product.",
          priceCents: BigInt(50_000_00),
          status: "LIVE",
          tags: ["phase-14"],
          variants: {
            create: {
              sku: `P14-V-${suffix.slice(0, 8)}`,
              label: "Standard",
              status: "AVAILABLE",
              stockQuantity: 10,
            },
          },
        },
        include: { variants: true },
      });
      const variant = product.variants[0];
      assert.ok(variant);

      await expectReservationRedirect(() =>
        createPublicOrderAction(
          { status: "idle", message: "" },
          orderForm({
            boothId: booth.id,
            slug,
            productId: product.id,
            variantId: variant.id,
            fulfillmentMethod: "PICKUP",
          }),
        ),
      );
      const pickup = await db.order.findFirstOrThrow({
        where: { boothId, fulfillmentMethod: "PICKUP" },
      });
      assert.equal(pickup.customerPhone, "0901234567");
      assert.equal(pickup.customerSocialContact, "@phase-fourteen");
      assert.equal(pickup.shippingAddress, null);
      assert.match(pickup.transferReference, /^[ -~]{1,10}$/);
      assert.notEqual(pickup.transferReference, pickup.code);

      const beforeMissingAddress = await db.order.count({ where: { boothId } });
      const missingAddress = await createPublicOrderAction(
        { status: "idle", message: "" },
        orderForm({
          boothId,
          slug,
          productId: product.id,
          variantId: variant.id,
          fulfillmentMethod: "SHIP",
        }),
      );
      assert.equal(missingAddress.status, "error");
      assert.equal(
        await db.order.count({ where: { boothId } }),
        beforeMissingAddress,
      );

      await expectReservationRedirect(() =>
        createPublicOrderAction(
          { status: "idle", message: "" },
          orderForm({
            boothId: booth.id,
            slug,
            productId: product.id,
            variantId: variant.id,
            fulfillmentMethod: "SHIP",
            shippingAddress: "  1 Lantern Street \r\n Ward 2 \r\n HCMC ",
            customerSocialContact: "https://social.example/phase14",
          }),
        ),
      );
      const shipped = await db.order.findFirstOrThrow({
        where: { boothId, fulfillmentMethod: "SHIP" },
      });
      assert.equal(shipped.shippingAddress, "1 Lantern Street\nWard 2\nHCMC");

      await assert.rejects(
        db.order.create({
          data: {
            boothId,
            code: `CYF-${suffix.slice(0, 20).toUpperCase()}`,
            customerName: "Invalid direct order",
            customerEmail: "invalid@example.com",
            customerPhone: "0901234567",
            fulfillmentMethod: "SHIP",
            subtotalCents: BigInt(1_000_00),
            totalCents: BigInt(1_000_00),
            transferReference: "CFDIRECT01",
            idempotencyKey: randomUUID(),
          },
        }),
      );

      const staffRead = await readOrderDetailForMember({
        boothId,
        orderId: shipped.id,
        actorUserId: staffId,
      });
      assert.equal(staffRead.kind, "found");
      if (staffRead.kind === "found") {
        assert.equal(staffRead.order.shippingAddress, shipped.shippingAddress);
        assert.equal(
          staffRead.order.customerSocialContact,
          shipped.customerSocialContact,
        );
      }
      assert.equal(
        (
          await readOrderDetailForMember({
            boothId,
            orderId: shipped.id,
            actorUserId: strangerId,
          })
        ).kind,
        "forbidden",
      );
      assert.equal(
        (
          await readOrderDetailForMember({
            boothId: secondBoothId,
            orderId: shipped.id,
            actorUserId: ownerId,
          })
        ).kind,
        "missing",
      );

      const shipmentInput = {
        carrier: "Vietnam Post",
        trackingNumber: "VN-PHASE14",
        trackingUrl: "https://tracking.example/VN-PHASE14",
      };
      assert.equal(
        (
          await saveOrderShipment({
            boothId,
            orderId: shipped.id,
            actorUserId: staffId,
            shipment: shipmentInput,
          })
        ).kind,
        "forbidden",
      );
      assert.equal(
        (
          await saveOrderShipment({
            boothId: secondBoothId,
            orderId: shipped.id,
            actorUserId: ownerId,
            shipment: shipmentInput,
          })
        ).kind,
        "missing",
      );
      assert.equal(
        (
          await saveOrderShipment({
            boothId,
            orderId: pickup.id,
            actorUserId: ownerId,
            shipment: shipmentInput,
          })
        ).kind,
        "not-shipping",
      );
      assert.equal(
        (
          await saveOrderShipment({
            boothId,
            orderId: shipped.id,
            actorUserId: ownerId,
            shipment: shipmentInput,
          })
        ).kind,
        "updated",
      );
      const reloadedShipment = await db.order.findUniqueOrThrow({
        where: { id: shipped.id },
      });
      assert.equal(reloadedShipment.shipmentCarrier, shipmentInput.carrier);
      assert.equal(
        reloadedShipment.shipmentTrackingNumber,
        shipmentInput.trackingNumber,
      );
      assert.equal(
        reloadedShipment.shipmentTrackingUrl,
        shipmentInput.trackingUrl,
      );
      assert.equal(
        await db.auditLog.count({
          where: {
            boothId,
            actorUserId: ownerId,
            action: "order.shipment_updated",
            entityId: shipped.id,
          },
        }),
        1,
      );

      assert.equal(
        (
          await readPaymentReceiptsForManager({
            boothId,
            actorUserId: staffId,
          })
        ).kind,
        "forbidden",
      );
      assert.equal(
        (
          await readShippingOrdersForManager({
            boothId,
            actorUserId: staffId,
          })
        ).kind,
        "forbidden",
      );
      assert.equal(
        (
          await readOrderDetailForManager({
            boothId,
            orderId: shipped.id,
            actorUserId: staffId,
          })
        ).kind,
        "forbidden",
      );

      const receipts = await readPaymentReceiptsForManager({
        boothId,
        actorUserId: ownerId,
      });
      assert.equal(receipts.kind, "found");
      if (receipts.kind === "found") {
        assert.equal(receipts.receipts.length, 2);
        const linkedReceipt = receipts.receipts.find(
          (receipt) => receipt.orderId === shipped.id,
        );
        assert.equal(linkedReceipt?.orderCode, shipped.code);
        assert.equal(linkedReceipt?.paymentState, "AWAITING_REVIEW");
        assert.equal(linkedReceipt?.amountCents, shipped.totalCents.toString());
      }

      const shippingOrders = await readShippingOrdersForManager({
        boothId,
        actorUserId: ownerId,
      });
      assert.equal(shippingOrders.kind, "found");
      if (shippingOrders.kind === "found") {
        assert.deepEqual(
          shippingOrders.orders.map((order) => order.id),
          [shipped.id],
        );
        assert.equal(
          shippingOrders.orders[0]?.shipmentTrackingNumber,
          shipmentInput.trackingNumber,
        );
      }
      assert.equal(
        (
          await readShippingOrdersForManager({
            boothId: secondBoothId,
            actorUserId: staffId,
          })
        ).kind,
        "forbidden",
      );
      const crossBoothShipping = await readShippingOrdersForManager({
        boothId: secondBoothId,
        actorUserId: ownerId,
      });
      assert.equal(crossBoothShipping.kind, "found");
      if (crossBoothShipping.kind === "found") {
        assert.equal(crossBoothShipping.orders.length, 0);
      }
      assert.equal(
        (
          await readOrderDetailForManager({
            boothId: secondBoothId,
            orderId: shipped.id,
            actorUserId: ownerId,
          })
        ).kind,
        "missing",
      );

      assert.equal(
        (
          await transitionOrderStatus({
            boothId,
            orderId: shipped.id,
            actorUserId: ownerId,
            nextStatus: "CONFIRMED",
          })
        ).kind,
        "changed",
      );
      const managerDetail = await readOrderDetailForManager({
        boothId,
        orderId: shipped.id,
        actorUserId: ownerId,
      });
      assert.equal(managerDetail.kind, "found");
      if (managerDetail.kind === "found") {
        assert.deepEqual(
          managerDetail.receiptHistory.map((entry) => entry.orderStatus),
          ["PENDING", "CONFIRMED"],
        );
        assert.equal(
          managerDetail.receiptHistory[1]?.amountCents,
          shipped.totalCents.toString(),
        );
        assert.equal(
          managerDetail.receiptHistory[1]?.actorName,
          "Phase Fourteen Owner",
        );
      }

      const legacyCode = `CYF-${suffix.slice(0, 20).toUpperCase()}`;
      const legacy = await db.order.create({
        data: {
          boothId,
          code: legacyCode,
          customerName: "Historical Customer",
          customerEmail: "historical@example.com",
          subtotalCents: BigInt(1_000_00),
          totalCents: BigInt(1_000_00),
          transferReference: legacyCode,
          idempotencyKey: randomUUID(),
        },
      });
      assert.equal(legacy.fulfillmentMethod, null);
      const publicLegacy = await readPublicReservation({
        slug,
        code: legacy.code,
      });
      assert.equal(publicLegacy?.code, legacy.code);
      assert.equal(publicLegacy?.fulfillmentMethod, null);
      assert.equal("customerPhone" in (publicLegacy ?? {}), false);
      assert.equal("customerSocialContact" in (publicLegacy ?? {}), false);
      assert.equal("shippingAddress" in (publicLegacy ?? {}), false);
      assert.equal("shipmentTrackingNumber" in (publicLegacy ?? {}), false);
    } finally {
      if (boothId) await db.order.deleteMany({ where: { boothId } });
      if (secondBoothId) {
        await db.booth.deleteMany({ where: { id: secondBoothId } });
      }
      if (boothId) await db.booth.deleteMany({ where: { id: boothId } });
      await db.user.deleteMany({
        where: { id: { in: [ownerId, staffId, strangerId] } },
      });
    }
  },
);
