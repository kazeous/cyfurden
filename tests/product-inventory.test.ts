import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPurchasableInventory,
  isProductInventoryExhausted,
  productAttentionWhere,
  resolveProductStatusAfterInventoryChange,
} from "../lib/product-inventory";

test("tracked inventory automatically resolves live products to sold out", () => {
  const exhausted = [{ status: "AVAILABLE", stockQuantity: 0 }];
  assert.equal(isProductInventoryExhausted(exhausted), true);
  assert.equal(
    resolveProductStatusAfterInventoryChange("LIVE", exhausted),
    "SOLD_OUT",
  );
  assert.equal(
    resolveProductStatusAfterInventoryChange("HIDDEN", exhausted),
    "HIDDEN",
  );
  assert.equal(
    resolveProductStatusAfterInventoryChange("DRAFT", exhausted),
    "DRAFT",
  );
});

test("available or untracked purchasable inventory keeps a product live", () => {
  const available = [
    { status: "AVAILABLE", stockQuantity: 0 },
    { status: "LOW_STOCK", stockQuantity: 2 },
  ];
  const preorder = [
    { status: "AVAILABLE", stockQuantity: 0 },
    { status: "PREORDER", stockQuantity: null },
  ];

  assert.equal(isProductInventoryExhausted(available), false);
  assert.equal(isProductInventoryExhausted(preorder), false);
  assert.equal(hasPurchasableInventory(available), true);
  assert.equal(hasPurchasableInventory(preorder), true);
  assert.equal(
    resolveProductStatusAfterInventoryChange("LIVE", available),
    "LIVE",
  );
});

test("released inventory can reopen an automatically sold-out product", () => {
  const restocked = [{ status: "AVAILABLE", stockQuantity: 1 }];
  assert.equal(
    resolveProductStatusAfterInventoryChange("SOLD_OUT", restocked),
    "SOLD_OUT",
  );
  assert.equal(
    resolveProductStatusAfterInventoryChange("SOLD_OUT", restocked, {
      restoreSoldOut: true,
    }),
    "LIVE",
  );
});

test("the dashboard attention filter combines sold-out and low-stock live products", () => {
  assert.deepEqual(productAttentionWhere, {
    OR: [
      { status: "SOLD_OUT" },
      {
        status: "LIVE",
        variants: { some: { status: "LOW_STOCK" } },
      },
    ],
  });
});
