import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createPublicOrderAction,
  type PublicOrderState,
} from "../app/s/[slug]/actions";
import { db } from "../lib/db";
import { inspectOracleImageBytes } from "../lib/oracle-image-verification";
import {
  PRESIGNED_UPLOAD_MAX_BYTES,
  presignedUploadRequestSchema,
} from "../lib/oracle-presign-contract";
import { ProductImageValidationError } from "../lib/payment-qr";
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

const preparedWebpFixture = Uint8Array.from(
  Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA",
    "base64",
  ),
);

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
  "Phase 14D integrates migration, reservations, roles, receipts, and shipments",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `phase14-owner-${suffix}`;
    const adminId = `phase14-admin-${suffix}`;
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
            id: adminId,
            name: "Phase Fourteen Admin",
            email: `phase14-admin-${suffix}@example.com`,
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
              { userId: adminId, role: "ADMIN", status: "ACTIVE" },
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

      const appliedMigration = await db.$queryRaw<
        Array<{ finished_at: Date | null; migration_name: string }>
      >`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE migration_name = '0012_phase14a_order_fulfillment_contracts'
      `;
      assert.equal(appliedMigration.length, 1);
      assert.ok(appliedMigration[0]?.finished_at);

      const phase14Constraints = await db.$queryRaw<Array<{ conname: string }>>`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = '"Order"'::regclass
          AND conname LIKE 'Order_phase14_%'
        ORDER BY conname
      `;
      assert.deepEqual(
        phase14Constraints.map(({ conname }) => conname),
        [
          "Order_phase14_phone_check",
          "Order_phase14_shipment_scope_check",
          "Order_phase14_shipment_values_check",
          "Order_phase14_shipping_address_check",
          "Order_phase14_social_contact_check",
          "Order_phase14_transfer_reference_check",
        ],
      );

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

      const beforeInvalidReservations = await db.order.count({
        where: { boothId },
      });
      for (const invalidForm of [
        orderForm({
          boothId,
          slug,
          productId: product.id,
          variantId: variant.id,
          fulfillmentMethod: "SHIP",
        }),
        orderForm({
          boothId,
          slug,
          productId: product.id,
          variantId: variant.id,
          fulfillmentMethod: "PICKUP",
          customerPhone: "09012345678",
        }),
        orderForm({
          boothId,
          slug,
          productId: product.id,
          variantId: variant.id,
          fulfillmentMethod: "PICKUP",
          customerSocialContact: "javascript:alert(1)",
        }),
      ]) {
        const invalidReservation = await createPublicOrderAction(
          { status: "idle", message: "" },
          invalidForm,
        );
        assert.equal(invalidReservation.status, "error");
      }
      assert.equal(
        await db.order.count({ where: { boothId } }),
        beforeInvalidReservations,
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
      await assert.rejects(
        db.order.create({
          data: {
            boothId,
            code: `CYF-PHONE-${suffix.slice(0, 12).toUpperCase()}`,
            customerName: "Invalid phone order",
            customerEmail: "invalid-phone@example.com",
            customerPhone: "09012345678",
            fulfillmentMethod: "PICKUP",
            subtotalCents: BigInt(1_000_00),
            totalCents: BigInt(1_000_00),
            transferReference: "PHONE00001",
            idempotencyKey: randomUUID(),
          },
        }),
      );
      await assert.rejects(
        db.order.create({
          data: {
            boothId,
            code: `CYF-REF-${suffix.slice(0, 14).toUpperCase()}`,
            customerName: "Invalid reference order",
            customerEmail: "invalid-reference@example.com",
            customerPhone: "0901234567",
            fulfillmentMethod: "PICKUP",
            subtotalCents: BigInt(1_000_00),
            totalCents: BigInt(1_000_00),
            transferReference: "12345678901",
            idempotencyKey: randomUUID(),
          },
        }),
      );
      await assert.rejects(
        db.order.create({
          data: {
            boothId,
            code: `CYF-SHIP-${suffix.slice(0, 13).toUpperCase()}`,
            customerName: "Invalid pickup shipment",
            customerEmail: "invalid-shipment@example.com",
            customerPhone: "0901234567",
            fulfillmentMethod: "PICKUP",
            shipmentCarrier: "Carrier must not be set",
            subtotalCents: BigInt(1_000_00),
            totalCents: BigInt(1_000_00),
            transferReference: "SHIP000001",
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
            actorUserId: adminId,
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
            actorUserId: adminId,
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
        actorUserId: adminId,
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
        actorUserId: adminId,
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
        where: { id: { in: [ownerId, adminId, staffId, strangerId] } },
      });
    }
  },
);

test(
  "Phase 14D verifies prepared upload MIME and real bytes through the Oracle contract",
  { skip: !enabled },
  async () => {
    const request = presignedUploadRequestSchema.parse({
      boothId: "phase14d_upload_booth",
      purpose: "product",
      contentType: "image/webp",
      contentLength: preparedWebpFixture.byteLength,
    });
    assert.equal(request.contentType, "image/webp");
    assert.equal(request.contentLength, preparedWebpFixture.byteLength);

    const verified = inspectOracleImageBytes(
      preparedWebpFixture,
      request.contentType,
    );
    assert.equal(verified.image.contentType, "image/webp");
    assert.equal(verified.image.bytes, preparedWebpFixture);
    assert.equal(verified.contentTypeMatches, true);
    assert.equal(
      inspectOracleImageBytes(preparedWebpFixture, "image/png")
        .contentTypeMatches,
      false,
    );

    const exactLimitWebp = new Uint8Array(PRESIGNED_UPLOAD_MAX_BYTES);
    exactLimitWebp.set(preparedWebpFixture);
    assert.equal(
      inspectOracleImageBytes(exactLimitWebp, "image/webp").image.bytes
        .byteLength,
      PRESIGNED_UPLOAD_MAX_BYTES,
    );
    const oversizedWebp = new Uint8Array(PRESIGNED_UPLOAD_MAX_BYTES + 1);
    oversizedWebp.set(preparedWebpFixture);
    assert.throws(
      () => inspectOracleImageBytes(oversizedWebp, "image/webp"),
      ProductImageValidationError,
    );
    assert.throws(
      () =>
        inspectOracleImageBytes(
          new TextEncoder().encode("not a raster image"),
          "image/webp",
        ),
      ProductImageValidationError,
    );
  },
);
