import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateSubmittedOrderLines,
  canTransitionOrderStatus,
  createOrderPaymentSnapshot,
  isPurchasableVariant,
  maximumPurchasableQuantity,
  readOrderPaymentSnapshot,
  renderTransferReference,
} from "../lib/order-rules";

test("tracked stock controls whether a variant is purchasable", () => {
  assert.equal(isPurchasableVariant("AVAILABLE", 5), true);
  assert.equal(isPurchasableVariant("LOW_STOCK", 1), true);
  assert.equal(isPurchasableVariant("PREORDER", null), true);
  assert.equal(isPurchasableVariant("AVAILABLE", 0), false);
  assert.equal(isPurchasableVariant("SOLD_OUT", 10), false);
  assert.equal(maximumPurchasableQuantity(5), 5);
  assert.equal(maximumPurchasableQuantity(null), 99);
});

test("duplicate submitted lines aggregate before stock validation", () => {
  assert.deepEqual(
    aggregateSubmittedOrderLines([
      { productId: "product-1", variantId: "variant-1", quantity: 2 },
      { productId: "product-1", variantId: "variant-1", quantity: 3 },
    ]),
    [{ productId: "product-1", variantId: "variant-1", quantity: 5 }],
  );
  assert.throws(
    () =>
      aggregateSubmittedOrderLines([
        { productId: "product-1", variantId: "variant-1", quantity: 50 },
        { productId: "product-1", variantId: "variant-1", quantity: 50 },
      ]),
    /cannot exceed 99/,
  );
});

test("order transitions make released and fulfilled reservations terminal", () => {
  assert.equal(canTransitionOrderStatus("PENDING", "CONFIRMED"), true);
  assert.equal(canTransitionOrderStatus("PENDING", "CANCELLED"), true);
  assert.equal(canTransitionOrderStatus("CONFIRMED", "FULFILLED"), true);
  assert.equal(canTransitionOrderStatus("CANCELLED", "PENDING"), false);
  assert.equal(canTransitionOrderStatus("EXPIRED", "PENDING"), false);
  assert.equal(canTransitionOrderStatus("FULFILLED", "CANCELLED"), false);
});

test("payment handoff requires a destination and survives JSON round trips", () => {
  assert.equal(
    createOrderPaymentSnapshot({
      bankName: "",
      accountName: "",
      accountNumber: "",
      qrObjectKey: null,
      instructions: "Transfer manually",
      disclaimer: "Reviewed manually",
    }),
    null,
  );

  const snapshot = createOrderPaymentSnapshot({
    bankName: " Example Bank ",
    accountName: " Studio Owner ",
    accountNumber: " 123456 ",
    qrObjectKey: null,
    instructions: " Transfer the exact amount. ",
    disclaimer: " Manual review only. ",
  });
  assert.deepEqual(readOrderPaymentSnapshot(snapshot), {
    bankName: "Example Bank",
    accountName: "Studio Owner",
    accountNumber: "123456",
    qrObjectKey: null,
    instructions: "Transfer the exact amount.",
    disclaimer: "Manual review only.",
  });
});

test("transfer references always retain the private reservation code", () => {
  assert.equal(
    renderTransferReference("ORDER-{ORDER}", "CYF-ABC"),
    "ORDER-CYF-ABC",
  );
  assert.equal(renderTransferReference("BOOTH", "CYF-ABC"), "BOOTH CYF-ABC");
});
