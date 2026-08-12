import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  ProductVariantScopeError,
  synchronizeProductVariants,
  type ProductVariantInput,
} from "../lib/product-variants";

const enabled = process.env.CYFURDEN_PHASE16_INTEGRATION === "1";

test(
  "Phase 16 synchronizes ordered variants and preserves referenced history",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `phase16-owner-${suffix}`;
    let boothId: string | null = null;

    try {
      await db.user.create({
        data: {
          id: ownerId,
          name: "Phase Sixteen Owner",
          email: `phase16-${suffix}@example.com`,
          emailVerified: true,
        },
      });
      const booth = await db.booth.create({
        data: {
          slug: `phase16-${suffix.slice(0, 16)}`,
          name: "Phase Sixteen Booth",
          ownerId,
          memberships: {
            create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      boothId = booth.id;
      const product = await db.product.create({
        data: {
          boothId,
          slug: "variant-poster",
          sku: "POSTER",
          name: "Variant poster",
          description: "One listing with several sizes",
          priceCents: BigInt(10_000),
          variants: {
            create: [
              {
                sku: "POSTER-A4",
                label: "A4",
                stockQuantity: 10,
                sortOrder: 0,
              },
              {
                sku: "POSTER-A5",
                label: "A5",
                stockQuantity: 5,
                sortOrder: 1,
              },
              {
                sku: "POSTER-A6",
                label: "A6",
                stockQuantity: 2,
                sortOrder: 2,
              },
            ],
          },
        },
        include: { variants: { orderBy: { sortOrder: "asc" } } },
      });
      const [a4, a5, a6] = product.variants;
      assert.ok(a4 && a5 && a6);

      const banner = await db.gachaBanner.create({
        data: {
          boothId,
          title: "History reference",
          copy: "Free-only test banner",
          pool: {
            create: {
              productVariantId: a5.id,
              displayName: "Variant poster · A5",
            },
          },
        },
      });

      const manifest: ProductVariantInput[] = [
        {
          id: a4.id,
          sku: "POSTER-A4-UPDATED",
          label: "A4 · Matte",
          priceCents: BigInt(12_500),
          status: "LOW_STOCK",
          stockQuantity: 3,
          fulfillmentNote: "Sleeve separately",
          sortOrder: 0,
        },
        {
          id: null,
          sku: "POSTER-A3",
          label: "A3",
          priceCents: null,
          status: "PREORDER",
          stockQuantity: null,
          fulfillmentNote: null,
          sortOrder: 1,
        },
      ];

      const summary = await db.$transaction(
        (transaction) =>
          synchronizeProductVariants(transaction, product.id, manifest),
        { isolationLevel: "Serializable" },
      );
      assert.deepEqual(summary, {
        created: 1,
        updated: 1,
        hidden: 1,
        deleted: 1,
      });

      const saved = await db.productVariant.findMany({
        where: { productId: product.id },
        orderBy: { sortOrder: "asc" },
      });
      assert.deepEqual(
        saved.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          label: variant.label,
          priceCents: variant.priceCents,
          status: variant.status,
          stockQuantity: variant.stockQuantity,
          sortOrder: variant.sortOrder,
        })),
        [
          {
            id: a4.id,
            sku: "POSTER-A4-UPDATED",
            label: "A4 · Matte",
            priceCents: BigInt(12_500),
            status: "LOW_STOCK",
            stockQuantity: 3,
            sortOrder: 0,
          },
          {
            id: saved[1]!.id,
            sku: "POSTER-A3",
            label: "A3",
            priceCents: null,
            status: "PREORDER",
            stockQuantity: null,
            sortOrder: 1,
          },
          {
            id: a5.id,
            sku: "POSTER-A5",
            label: "A5",
            priceCents: null,
            status: "HIDDEN",
            stockQuantity: 5,
            sortOrder: 2,
          },
        ],
      );
      assert.equal(await db.productVariant.count({ where: { id: a6.id } }), 0);
      assert.equal(
        await db.gachaPoolEntry.count({
          where: { bannerId: banner.id, productVariantId: a5.id },
        }),
        1,
      );

      const swapManifest: ProductVariantInput[] = saved.map(
        (variant, index) => ({
          id: variant.id,
          sku:
            index === 0
              ? saved[1]!.sku
              : index === 1
                ? saved[0]!.sku
                : variant.sku,
          label: variant.label,
          priceCents: variant.priceCents,
          status: variant.status,
          stockQuantity: variant.stockQuantity,
          fulfillmentNote: variant.fulfillmentNote,
          sortOrder: variant.sortOrder,
        }),
      );
      const swapSummary = await db.$transaction(
        (transaction) =>
          synchronizeProductVariants(transaction, product.id, swapManifest),
        { isolationLevel: "Serializable" },
      );
      assert.deepEqual(swapSummary, {
        created: 0,
        updated: 3,
        hidden: 0,
        deleted: 0,
      });
      assert.deepEqual(
        (
          await db.productVariant.findMany({
            where: { productId: product.id },
            orderBy: { sortOrder: "asc" },
          })
        ).map(({ id, sku }) => ({ id, sku })),
        [
          { id: saved[0]!.id, sku: "POSTER-A3" },
          { id: saved[1]!.id, sku: "POSTER-A4-UPDATED" },
          { id: saved[2]!.id, sku: "POSTER-A5" },
        ],
      );

      const other = await db.product.create({
        data: {
          boothId,
          slug: "other-product",
          name: "Other product",
          description: "Cross-product guard",
          priceCents: BigInt(20_000),
          variants: { create: { sku: "OTHER", label: "Other" } },
        },
        include: { variants: true },
      });
      const beforeRejected = await db.productVariant.findMany({
        where: { productId: product.id },
        orderBy: { sortOrder: "asc" },
      });
      await assert.rejects(
        db.$transaction((transaction) =>
          synchronizeProductVariants(transaction, product.id, [
            { ...manifest[0]!, id: other.variants[0]!.id },
          ]),
        ),
        ProductVariantScopeError,
      );
      const afterRejected = await db.productVariant.findMany({
        where: { productId: product.id },
        orderBy: { sortOrder: "asc" },
      });
      assert.deepEqual(afterRejected, beforeRejected);
    } finally {
      if (boothId) await db.booth.deleteMany({ where: { id: boothId } });
      await db.user.deleteMany({ where: { id: ownerId } });
    }
  },
);
