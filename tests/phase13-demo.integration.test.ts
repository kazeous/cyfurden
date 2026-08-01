import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  DEMO_BOOTH_ID,
  DEMO_BOOTH_SLUG,
  DEMO_OWNER_ID,
} from "../lib/demo-booth";
import { seedDemoBooth } from "../lib/demo-booth-seed";
import { readPublishedGachaDocument } from "../lib/gacha-document";
import { readStorefrontDocument } from "../lib/storefront-document";

const enabled = process.env.CYFURDEN_PHASE13_INTEGRATION === "1";

test(
  "Phase 13 seeds idempotently, showcases later phases, and isolates non-demo data",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const sentinelUserId = `phase13-user-${suffix}`;
    let sentinelBoothId: string | null = null;

    try {
      await db.booth.deleteMany({ where: { id: DEMO_BOOTH_ID } });
      await db.user.deleteMany({ where: { id: DEMO_OWNER_ID } });
      await db.user.create({
        data: {
          id: sentinelUserId,
          name: "Phase Thirteen Sentinel",
          email: `phase13-${suffix}@example.com`,
          emailVerified: true,
        },
      });
      const sentinel = await db.booth.create({
        data: {
          name: "Untouched Sentinel Booth",
          slug: `phase13-sentinel-${suffix.slice(0, 12)}`,
          status: "DRAFT",
          ownerId: sentinelUserId,
          products: {
            create: {
              slug: "sentinel-product",
              sku: `P13-${suffix.slice(0, 8)}`,
              name: "Sentinel Product",
              description: "Must remain unchanged by the demo seed.",
              priceCents: BigInt(99_000),
              status: "LIVE",
              tags: ["sentinel"],
            },
          },
        },
      });
      sentinelBoothId = sentinel.id;
      const sentinelBefore = await db.booth.findUniqueOrThrow({
        where: { id: sentinel.id },
        select: {
          name: true,
          slug: true,
          status: true,
          locale: true,
          currency: true,
          ownerId: true,
          products: {
            select: { name: true, priceCents: true, status: true, tags: true },
          },
        },
      });

      const first = await seedDemoBooth();
      const second = await seedDemoBooth();
      assert.deepEqual(second, first);
      assert.equal(first.slug, DEMO_BOOTH_SLUG);
      assert.equal(first.productCount, 3);
      assert.equal(first.gachaRevealCount, 4);

      const demo = await db.booth.findUniqueOrThrow({
        where: { id: DEMO_BOOTH_ID },
        include: {
          categories: true,
          products: { include: { variants: true } },
          promotions: { include: { products: true } },
          storefront: true,
          paymentInstructions: true,
          gacha: true,
          gachaBanners: { include: { pool: true } },
        },
      });
      assert.equal(demo.status, "PUBLISHED");
      assert.equal(demo.categories.length, 2);
      assert.equal(demo.products.length, 3);
      assert.equal(
        demo.products.reduce(
          (total, product) => total + product.variants.length,
          0,
        ),
        4,
      );
      assert.equal(demo.promotions.length, 1);
      assert.equal(demo.promotions[0].active, true);
      assert.deepEqual(
        demo.promotions[0].products.map((link) => link.role).sort(),
        ["BUY", "BUY", "REWARD"],
      );
      const storefront = readStorefrontDocument(
        demo.storefront?.publishedDocument,
        demo.name,
      );
      assert.equal(storefront.featuredProductIds?.length, 3);
      assert.match(
        demo.paymentInstructions?.bankName ?? "",
        /do not transfer/i,
      );
      const gacha = readPublishedGachaDocument(demo.gacha?.publishedDocument);
      assert.ok(gacha);
      assert.equal(gacha.resultContract, "DIGITAL_REVEAL_ONLY");
      assert.equal(gacha.banners[0].pool.length, 4);

      assert.deepEqual(
        await db.booth.findUniqueOrThrow({
          where: { id: sentinel.id },
          select: {
            name: true,
            slug: true,
            status: true,
            locale: true,
            currency: true,
            ownerId: true,
            products: {
              select: {
                name: true,
                priceCents: true,
                status: true,
                tags: true,
              },
            },
          },
        }),
        sentinelBefore,
      );

      await db.booth.delete({ where: { id: DEMO_BOOTH_ID } });
      await db.user.delete({ where: { id: DEMO_OWNER_ID } });
      await db.booth.update({
        where: { id: sentinel.id },
        data: { slug: DEMO_BOOTH_SLUG },
      });
      await assert.rejects(seedDemoBooth(), /Refusing to seed/);
      const collision = await db.booth.findUniqueOrThrow({
        where: { id: sentinel.id },
        select: { name: true, slug: true, ownerId: true },
      });
      assert.deepEqual(collision, {
        name: "Untouched Sentinel Booth",
        slug: DEMO_BOOTH_SLUG,
        ownerId: sentinelUserId,
      });
      assert.equal(await db.user.count({ where: { id: DEMO_OWNER_ID } }), 0);
    } finally {
      await db.booth.deleteMany({ where: { id: DEMO_BOOTH_ID } });
      if (sentinelBoothId) {
        await db.booth.deleteMany({ where: { id: sentinelBoothId } });
      }
      await db.user.deleteMany({ where: { id: DEMO_OWNER_ID } });
      await db.user.deleteMany({ where: { id: sentinelUserId } });
    }
  },
);
