import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createPublicOrderAction,
  type PublicOrderState,
} from "../app/s/[slug]/actions";
import { db } from "../lib/db";
import { orderEventWhere } from "../lib/order-events";
import { createDefaultStorefrontDocument } from "../lib/storefront-document";

const enabled = process.env.CYFURDEN_PHASE10_INTEGRATION === "1";

function orderForm(input: {
  boothId: string;
  slug: string;
  idempotencyKey: string;
  productId: string;
  variantId: string;
}) {
  const form = new FormData();
  form.set("boothId", input.boothId);
  form.set("slug", input.slug);
  form.set("idempotencyKey", input.idempotencyKey);
  form.set("customerName", "Phase Ten Customer");
  form.set("customerEmail", "phase10-customer@example.com");
  form.set("customerPhone", "0901234567");
  form.set("customerSocialContact", "@phase-ten-customer");
  form.set("fulfillmentMethod", "PICKUP");
  form.set("shippingAddress", "");
  form.set("customerNote", "Event attribution acceptance");
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
  "Phase 10 attributes reservations and filters event orders without losing unassigned orders",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase10-user-${suffix}`;
    const slug = `phase10-${suffix.slice(0, 16)}`;
    let boothId: string | null = null;
    let secondBoothId: string | null = null;

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase Ten Owner",
          email: `phase10-${suffix}@example.com`,
          emailVerified: true,
        },
      });
      const booth = await db.booth.create({
        data: {
          slug,
          name: "Phase Ten Booth",
          status: "PUBLISHED",
          ownerId: userId,
          memberships: {
            create: { userId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      boothId = booth.id;
      const document = createDefaultStorefrontDocument(booth.name);
      await db.storefrontConfig.create({
        data: {
          boothId,
          draftDocument: document,
          publishedDocument: document,
          publishedAt: new Date(),
          updatedById: userId,
        },
      });
      await db.boothPaymentInstruction.create({
        data: {
          boothId,
          bankName: "VietQR Test Bank",
          bankCode: "970415",
          accountName: "CYFURDEN STUDIO",
          accountNumber: "0123456789",
          transferReferenceTemplate: "{code}",
          instructions: "Transfer the exact amount.",
          disclaimer: "Transfers are reviewed manually.",
        },
      });
      const product = await db.product.create({
        data: {
          boothId,
          slug: "phase-ten-pin",
          sku: `PHASE10-${suffix.slice(0, 8)}`,
          name: "Phase Ten Pin",
          description: "Event attribution integration product.",
          priceCents: BigInt(15_000_00),
          status: "LIVE",
          tags: ["phase-10"],
          variants: {
            create: {
              sku: `PHASE10-V-${suffix.slice(0, 8)}`,
              label: "Standard",
              status: "AVAILABLE",
              stockQuantity: 3,
            },
          },
        },
        include: { variants: true },
      });
      const variant = product.variants[0];
      assert.ok(variant);

      const now = new Date();
      const event = await db.event.create({
        data: {
          boothId,
          name: "Phase Ten Artist Alley",
          startsAt: new Date(now.getTime() - 86_400_000),
          endsAt: new Date(now.getTime() + 86_400_000),
        },
      });
      const attributedKey = randomUUID();
      await expectReservationRedirect(() =>
        createPublicOrderAction(
          { status: "idle", message: "" },
          orderForm({
            boothId: booth.id,
            slug,
            idempotencyKey: attributedKey,
            productId: product.id,
            variantId: variant.id,
          }),
        ),
      );
      const attributed = await db.order.findUniqueOrThrow({
        where: {
          boothId_idempotencyKey: {
            boothId,
            idempotencyKey: attributedKey,
          },
        },
      });
      assert.equal(attributed.eventId, event.id);

      await db.event.update({
        where: { id: event.id },
        data: { endsAt: new Date(now.getTime() - 1_000) },
      });
      const unassignedKey = randomUUID();
      await expectReservationRedirect(() =>
        createPublicOrderAction(
          { status: "idle", message: "" },
          orderForm({
            boothId: booth.id,
            slug,
            idempotencyKey: unassignedKey,
            productId: product.id,
            variantId: variant.id,
          }),
        ),
      );
      const unassigned = await db.order.findUniqueOrThrow({
        where: {
          boothId_idempotencyKey: {
            boothId,
            idempotencyKey: unassignedKey,
          },
        },
      });
      assert.equal(unassigned.eventId, null);

      assert.equal(
        await db.order.count({
          where: { boothId, ...orderEventWhere("queue", "ALL") },
        }),
        2,
      );
      assert.equal(
        await db.order.count({
          where: { boothId, ...orderEventWhere("events", "ALL") },
        }),
        1,
      );
      assert.equal(
        await db.order.count({
          where: { boothId, ...orderEventWhere("events", event.id) },
        }),
        1,
      );

      const secondBooth = await db.booth.create({
        data: {
          slug: `phase10-other-${suffix.slice(0, 12)}`,
          name: "Other Phase Ten Booth",
          ownerId: userId,
        },
      });
      secondBoothId = secondBooth.id;
      const foreignEvent = await db.event.create({
        data: {
          boothId: secondBoothId,
          name: "Foreign Booth Event",
          startsAt: new Date(now.getTime() - 3_600_000),
          endsAt: new Date(now.getTime() + 3_600_000),
        },
      });
      await assert.rejects(
        db.order.update({
          where: { id: attributed.id },
          data: { eventId: foreignEvent.id },
        }),
      );
    } finally {
      if (boothId) {
        await db.order.deleteMany({ where: { boothId } });
      }
      if (secondBoothId) {
        await db.booth.deleteMany({ where: { id: secondBoothId } });
      }
      if (boothId) {
        await db.booth.deleteMany({ where: { id: boothId } });
      }
      await db.user.deleteMany({ where: { id: userId } });
    }
  },
);
