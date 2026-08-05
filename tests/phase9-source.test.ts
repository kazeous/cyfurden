import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 9 promotion configuration persists scoped product roles", async () => {
  const [actions, productsPage, editor] = await Promise.all([
    readSource("app/manage/[boothId]/actions.ts"),
    readSource("app/manage/[boothId]/products/page.tsx"),
    readSource("app/manage/[boothId]/products/promotion-editor.tsx"),
  ]);

  assert.match(actions, /promotionSchema/);
  assert.match(actions, /transaction\.product\.count/);
  assert.match(actions, /transaction\.promotionProduct\.deleteMany/);
  assert.match(actions, /transaction\.promotionProduct\.createMany/);
  assert.match(actions, /action: "promotion\.saved"/);
  assert.match(productsPage, /<PromotionEditor/);
  assert.match(editor, /name="buyProductIds"/);
  assert.match(editor, /name="rewardProductIds"/);
  assert.match(editor, /name="repeatable"/);
  assert.match(editor, /name="active"/);
});

test("Phase 9 uses one pricing engine in the cart and serializable checkout", async () => {
  const [storefront, orderAction, publicPage] = await Promise.all([
    readSource("components/storefront/managed-storefront.tsx"),
    readSource("app/s/[slug]/actions.ts"),
    readSource("app/s/[slug]/page.tsx"),
  ]);

  assert.match(storefront, /applyQuantityPromotions/);
  assert.match(storefront, /promotionProgress/);
  assert.match(storefront, /cartPromotionSavingsLabel/);
  assert.match(publicPage, /where: \{ active: true \}/);
  assert.match(publicPage, /promotions=\{promotions\}/);
  assert.match(orderAction, /isolationLevel: "Serializable"/);
  assert.match(orderAction, /applyQuantityPromotions/);
  assert.match(orderAction, /unitPriceCents: BigInt\(0\)/);
  assert.match(orderAction, /originalUnitPriceCents: source\.unitPriceCents/);
  assert.match(orderAction, /promotionNameSnapshot: allocation\.promotionName/);
  assert.match(
    orderAction,
    /subtotalCents = promotionPricing\.subtotalMinorUnits/,
  );
  assert.match(orderAction, /totalCents = promotionPricing\.totalMinorUnits/);
});

test("Phase 9 keeps immutable promotion evidence visible after checkout", async () => {
  const [schema, migration, orders, reservation] = await Promise.all([
    readSource("prisma/schema.prisma"),
    readSource(
      "prisma/migrations/0009_phase9_quantity_promotions/migration.sql",
    ),
    readSource("app/manage/[boothId]/orders/page.tsx"),
    readSource("components/storefront/reservation-confirmation.tsx"),
  ]);

  assert.match(schema, /originalUnitPriceCents\s+BigInt\?/);
  assert.match(schema, /promotionNameSnapshot\s+String\?/);
  assert.match(migration, /OrderItem_promotion_reward_snapshot_check/);
  assert.match(migration, /"unitPriceCents" = 0/);
  assert.match(orders, /strings\.promotionReward/);
  assert.match(orders, /originalUnitPriceCents/);
  assert.match(orders, /parseBilingual\(item\.promotionNameSnapshot, locale\)/);
  assert.match(reservation, /promotionRewardLabel/);
  assert.match(reservation, /summaryPromotionSavings/);
});
