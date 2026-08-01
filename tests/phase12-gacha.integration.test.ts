import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "../generated/prisma/client";
import { db } from "../lib/db";
import {
  compileGachaDocument,
  readPublishedGachaDocument,
} from "../lib/gacha-document";
import { drawGachaReward } from "../lib/gacha-game";
import { DEFAULT_GACHA_RATES } from "../lib/gacha-rates";

const enabled = process.env.CYFURDEN_PHASE12_INTEGRATION === "1";

test(
  "Phase 12 publishes and clears a free-only snapshot without touching orders or stock",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase12-user-${suffix}`;
    let boothId: string | null = null;

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase Twelve Owner",
          email: `phase12-${suffix}@example.com`,
          emailVerified: true,
        },
      });
      const booth = await db.booth.create({
        data: {
          slug: `phase12-${suffix.slice(0, 16)}`,
          name: "Phase Twelve Booth",
          ownerId: userId,
          memberships: {
            create: { userId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      boothId = booth.id;
      const product = await db.product.create({
        data: {
          boothId,
          slug: "digital-reveal-lineup",
          sku: `P12-${suffix.slice(0, 8)}`,
          name: "Digital Reveal Lineup",
          description: "Names used by a free digital reveal game.",
          priceCents: BigInt(10_000_00),
          status: "LIVE",
          variants: {
            create: ["Common", "Rare", "Epic", "Legendary"].map(
              (label, index) => ({
                sku: `P12-${index}-${suffix.slice(0, 8)}`,
                label,
                status: "AVAILABLE",
                stockQuantity: 5,
                sortOrder: index,
              }),
            ),
          },
        },
        include: { variants: { orderBy: { sortOrder: "asc" } } },
      });
      await db.gachaConfig.create({
        data: {
          boothId,
          enabled: true,
          title: "Free digital reveal",
          introduction: "No purchase and no item entitlement.",
          gameTheme: "anemo",
          pityEnabled: true,
          guaranteedAt: 4,
          guaranteedRarity: "EPIC",
          rates: DEFAULT_GACHA_RATES,
        },
      });
      await db.gachaBanner.create({
        data: {
          boothId,
          title: "Convention lineup",
          copy: "A free digital souvenir reveal.",
          type: "COLLECTION",
          theme: "anemo",
          active: true,
          pool: {
            create: product.variants.map((variant, index) => ({
              productVariantId: variant.id,
              displayName: `${product.name} · ${variant.label}`,
              rarity: ["COMMON", "RARE", "EPIC", "LEGENDARY"][index] as
                | "COMMON"
                | "RARE"
                | "EPIC"
                | "LEGENDARY",
              weight: index + 1,
              featured: index >= 2,
              sortOrder: index,
            })),
          },
        },
      });

      const [config, banners] = await Promise.all([
        db.gachaConfig.findUnique({ where: { boothId } }),
        db.gachaBanner.findMany({
          where: { boothId },
          include: {
            pool: {
              include: { productVariant: { include: { product: true } } },
              orderBy: { sortOrder: "asc" },
            },
          },
        }),
      ]);
      const compiled = compileGachaDocument({ config, banners });
      assert.equal(compiled.success, true);
      if (!compiled.success) return;
      assert.equal(compiled.document.resultContract, "DIGITAL_REVEAL_ONLY");

      await db.gachaConfig.update({
        where: { boothId },
        data: {
          publishedDocument: compiled.document,
          publishedAt: new Date(compiled.document.publishedAt),
        },
      });
      const published = readPublishedGachaDocument(
        (await db.gachaConfig.findUniqueOrThrow({ where: { boothId } }))
          .publishedDocument,
      );
      assert.ok(published);
      assert.equal(published.banners.length, 1);

      const before = await db.productVariant.findMany({
        where: { productId: product.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, stockQuantity: true },
      });
      const draw = drawGachaReward({
        document: published,
        banner: published.banners[0],
        pityProgress: 3,
        rarityRandom: 0,
        rewardRandom: 0,
      });
      assert.equal(draw.guaranteeApplied, true);
      assert.equal(await db.order.count({ where: { boothId } }), 0);
      assert.deepEqual(
        await db.productVariant.findMany({
          where: { productId: product.id },
          orderBy: { sortOrder: "asc" },
          select: { id: true, stockQuantity: true },
        }),
        before,
      );

      await db.gachaConfig.update({
        where: { boothId },
        data: { publishedDocument: Prisma.DbNull, publishedAt: null },
      });
      const unpublished = await db.gachaConfig.findUniqueOrThrow({
        where: { boothId },
      });
      assert.equal(unpublished.publishedDocument, null);
      assert.equal(unpublished.publishedAt, null);

      await assert.rejects(
        db.gachaPoolEntry.update({
          where: { id: banners[0].pool[0].id },
          data: { weight: 0 },
        }),
      );
    } finally {
      if (boothId) await db.booth.deleteMany({ where: { id: boothId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
  },
);
