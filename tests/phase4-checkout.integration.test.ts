import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createPublicOrderAction,
  type PublicOrderState,
} from "../app/s/[slug]/actions";
import { saveCustomerTransferReference } from "../lib/customer-transfer-reference";
import { db } from "../lib/db";
import { createDefaultStorefrontDocument } from "../lib/storefront-document";
import { buildVietQrPayload } from "../lib/vietqr";

const enabled = process.env.CYFURDEN_PHASE4_INTEGRATION === "1";
const keepFixture = process.env.CYFURDEN_PHASE4_KEEP_FIXTURE === "1";

function orderForm(input: {
  boothId: string;
  slug: string;
  idempotencyKey: string;
  productId: string;
  variantId: string;
  quantity: number;
}) {
  const form = new FormData();
  form.set("boothId", input.boothId);
  form.set("slug", input.slug);
  form.set("idempotencyKey", input.idempotencyKey);
  form.set("customerName", "Phase Four Customer");
  form.set("customerEmail", "phase4-customer@example.com");
  form.set("customerNote", "Convention pickup");
  form.set(
    "lines",
    JSON.stringify([
      {
        productId: input.productId,
        variantId: input.variantId,
        quantity: input.quantity,
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
    return digest;
  }
}

test(
  "Phase 4 creates one atomic pending reservation and accepts a manual bank reference",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase4-user-${suffix}`;
    const slug = `phase4-${suffix.slice(0, 16)}`;
    const userEmail = `phase4-${suffix}@example.com`;
    let boothId: string | null = null;

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase Four Owner",
          email: userEmail,
          emailVerified: true,
        },
      });
      const booth = await db.booth.create({
        data: {
          slug,
          name: "Phase Four Booth",
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
          paymentLabel: "Manual bank transfer",
          transferReferenceTemplate: "Long booth prefix {code} {item} {amount}",
          instructions: "Transfer the exact amount and keep the receipt.",
          disclaimer:
            "The booth reviews transfers manually; Cyfurden does not verify payment.",
        },
      });
      const product = await db.product.create({
        data: {
          boothId,
          slug: "phase-four-pin",
          sku: `PHASE4-${suffix.slice(0, 8)}`,
          name: "Phase Four Pin",
          description: "Integration acceptance product.",
          priceCents: BigInt(12_500_00),
          status: "LIVE",
          featured: true,
          tags: ["phase-4"],
          variants: {
            create: {
              sku: `PHASE4-V-${suffix.slice(0, 8)}`,
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
      const idempotencyKey = randomUUID();
      const firstForm = orderForm({
        boothId,
        slug,
        idempotencyKey,
        productId: product.id,
        variantId: variant.id,
        quantity: 2,
      });

      const redirectDigest = await expectReservationRedirect(() =>
        createPublicOrderAction({ status: "idle", message: "" }, firstForm),
      );
      const order = await db.order.findUniqueOrThrow({
        where: { boothId_idempotencyKey: { boothId, idempotencyKey } },
        include: { items: true },
      });
      assert.match(
        redirectDigest,
        new RegExp(`/s/${slug}/reservation/${order.code}`),
      );
      assert.equal(order.status, "PENDING");
      assert.equal(order.customerName, "Phase Four Customer");
      assert.equal(order.customerEmail, "phase4-customer@example.com");
      assert.equal(order.items.length, 1);
      assert.equal(order.items[0]?.quantity, 2);
      assert.equal(order.items[0]?.unitPriceCents, BigInt(12_500_00));
      assert.equal(order.totalCents, BigInt(25_000_00));
      assert.equal(order.code.length, 24);
      assert.equal(order.transferReference, order.code);
      assert.ok(order.transferReference.length <= 25);
      assert.ok(order.expiresAt && order.expiresAt > order.placedAt);

      const reservedVariant = await db.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      assert.equal(reservedVariant.stockQuantity, 1);

      buildVietQrPayload({
        bankCode: "970415",
        accountNumber: "0123456789",
        accountName: "CYFURDEN STUDIO",
        amountMinorUnits: order.totalCents,
        transferReference: order.transferReference,
      });

      await expectReservationRedirect(() =>
        createPublicOrderAction(
          { status: "idle", message: "" },
          orderForm({
            boothId: booth.id,
            slug,
            idempotencyKey,
            productId: product.id,
            variantId: variant.id,
            quantity: 2,
          }),
        ),
      );
      assert.equal(await db.order.count({ where: { boothId } }), 1);
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: variant.id },
          })
        ).stockQuantity,
        1,
      );

      const unavailable = await createPublicOrderAction(
        { status: "idle", message: "" },
        orderForm({
          boothId,
          slug,
          idempotencyKey: randomUUID(),
          productId: product.id,
          variantId: variant.id,
          quantity: 2,
        }),
      );
      assert.equal(unavailable.status, "error");
      assert.match(unavailable.message, /no longer has 2 available/i);
      assert.equal(await db.order.count({ where: { boothId } }), 1);

      const referenceSaved = await saveCustomerTransferReference({
        slug,
        code: order.code,
        customerTransferReference: "BANK-TRACE-20260724",
      });
      assert.equal(referenceSaved, true);
      assert.equal(
        (
          await db.order.findUniqueOrThrow({
            where: { id: order.id },
          })
        ).customerTransferReference,
        "BANK-TRACE-20260724",
      );
      if (keepFixture) {
        console.log(`PHASE4_FIXTURE_SLUG=${slug}`);
      }
    } finally {
      if (!keepFixture && boothId) {
        await db.order.deleteMany({ where: { boothId } });
        await db.booth.deleteMany({ where: { id: boothId } });
      }
      if (!keepFixture) {
        await db.user.deleteMany({ where: { id: userId } });
      }
    }
  },
);
