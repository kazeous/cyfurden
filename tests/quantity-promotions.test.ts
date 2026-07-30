import assert from "node:assert/strict";
import test from "node:test";
import {
  applyQuantityPromotions,
  type QuantityPromotionRule,
} from "../lib/quantity-promotions";

const rule = (
  overrides: Partial<QuantityPromotionRule> = {},
): QuantityPromotionRule => ({
  id: "offer-1",
  name: "Buy 3, get 1",
  buyQuantity: 3,
  rewardQuantity: 1,
  repeatable: true,
  buyProductIds: ["buy-product"],
  rewardProductIds: ["reward-product"],
  ...overrides,
});

test("non-qualifying carts keep every price unchanged", () => {
  const pricing = applyQuantityPromotions(
    [
      {
        lineId: "buy-line",
        productId: "buy-product",
        quantity: 2,
        unitPriceMinorUnits: BigInt(100),
      },
      {
        lineId: "reward-line",
        productId: "reward-product",
        quantity: 1,
        unitPriceMinorUnits: BigInt(40),
      },
    ],
    [rule()],
  );

  assert.equal(pricing.subtotalMinorUnits, BigInt(240));
  assert.equal(pricing.discountMinorUnits, BigInt(0));
  assert.equal(pricing.totalMinorUnits, BigInt(240));
  assert.equal(pricing.lines[1]?.freeQuantity, 0);
  assert.deepEqual(pricing.progress[0], {
    promotionId: "offer-1",
    promotionName: "Buy 3, get 1",
    buyQuantity: 3,
    rewardQuantity: 1,
    repeatable: true,
    appliedRewardQuantity: 0,
    unclaimedRewardQuantity: 0,
    remainingBuyQuantity: 1,
    savingsMinorUnits: BigInt(0),
  });
});

test("repeatable offers discount each earned reward exactly once", () => {
  const pricing = applyQuantityPromotions(
    [
      {
        lineId: "buy-line",
        productId: "buy-product",
        quantity: 6,
        unitPriceMinorUnits: BigInt(100),
      },
      {
        lineId: "reward-line",
        productId: "reward-product",
        quantity: 2,
        unitPriceMinorUnits: BigInt(40),
      },
    ],
    [rule()],
  );

  assert.equal(pricing.subtotalMinorUnits, BigInt(680));
  assert.equal(pricing.discountMinorUnits, BigInt(80));
  assert.equal(pricing.totalMinorUnits, BigInt(600));
  assert.equal(pricing.lines[1]?.paidQuantity, 0);
  assert.equal(pricing.lines[1]?.freeQuantity, 2);
  assert.deepEqual(pricing.lines[1]?.allocations, [
    {
      promotionId: "offer-1",
      promotionName: "Buy 3, get 1",
      quantity: 2,
    },
  ]);
  assert.equal(pricing.progress[0]?.appliedRewardQuantity, 2);
  assert.equal(pricing.progress[0]?.remainingBuyQuantity, 3);
});

test("non-repeatable offers cap the free quantity at one reward group", () => {
  const pricing = applyQuantityPromotions(
    [
      {
        lineId: "buy-line",
        productId: "buy-product",
        quantity: 6,
        unitPriceMinorUnits: BigInt(100),
      },
      {
        lineId: "reward-line",
        productId: "reward-product",
        quantity: 2,
        unitPriceMinorUnits: BigInt(40),
      },
    ],
    [rule({ repeatable: false })],
  );

  assert.equal(pricing.discountMinorUnits, BigInt(40));
  assert.equal(pricing.lines[1]?.paidQuantity, 1);
  assert.equal(pricing.lines[1]?.freeQuantity, 1);
  assert.equal(pricing.progress[0]?.remainingBuyQuantity, 0);
});

test("same-product buy 3 get 1 requires four units and repeats every four", () => {
  const sameProductRule = rule({
    buyProductIds: ["same-product"],
    rewardProductIds: ["same-product"],
  });
  const price = (quantity: number) =>
    applyQuantityPromotions(
      [
        {
          lineId: "same-line",
          productId: "same-product",
          quantity,
          unitPriceMinorUnits: BigInt(100),
        },
      ],
      [sameProductRule],
    );

  const three = price(3);
  assert.equal(three.lines[0]?.freeQuantity, 0);
  assert.equal(three.progress[0]?.unclaimedRewardQuantity, 1);
  assert.equal(three.totalMinorUnits, BigInt(300));

  const four = price(4);
  assert.equal(four.lines[0]?.freeQuantity, 1);
  assert.equal(four.totalMinorUnits, BigInt(300));

  const eight = price(8);
  assert.equal(eight.lines[0]?.freeQuantity, 2);
  assert.equal(eight.totalMinorUnits, BigInt(600));
});

test("later promotions cannot discount a reward unit twice", () => {
  const pricing = applyQuantityPromotions(
    [
      {
        lineId: "buy-line",
        productId: "buy-product",
        quantity: 2,
        unitPriceMinorUnits: BigInt(100),
      },
      {
        lineId: "reward-line",
        productId: "reward-product",
        quantity: 1,
        unitPriceMinorUnits: BigInt(40),
      },
    ],
    [
      rule({ id: "offer-1", buyQuantity: 1 }),
      rule({ id: "offer-2", buyQuantity: 1 }),
    ],
  );

  assert.equal(pricing.lines[1]?.freeQuantity, 1);
  assert.equal(pricing.lines[1]?.allocations.length, 1);
  assert.equal(pricing.discountMinorUnits, BigInt(40));
  assert.equal(pricing.totalMinorUnits, BigInt(200));
});

test("invalid promotion rules are inert and invalid cart prices are rejected", () => {
  const lines = [
    {
      lineId: "line",
      productId: "buy-product",
      quantity: 1,
      unitPriceMinorUnits: BigInt(100),
    },
  ];
  const pricing = applyQuantityPromotions(lines, [
    rule({ buyQuantity: 0 }),
    rule({ id: "missing-rewards", rewardProductIds: [] }),
  ]);

  assert.equal(pricing.totalMinorUnits, BigInt(100));
  assert.equal(pricing.progress.length, 0);
  assert.throws(
    () =>
      applyQuantityPromotions(
        [{ ...lines[0], unitPriceMinorUnits: BigInt(-1) }],
        [],
      ),
    /negative price/,
  );
});
