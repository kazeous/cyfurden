import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateSubmittedOrderLines,
  canTransitionOrderStatus,
  createOrderPaymentSnapshot,
  generateTransferReference,
  isPurchasableVariant,
  maximumPurchasableQuantity,
  readOrderPaymentSnapshot,
  renderTransferReference,
  VIETQR_TRANSFER_REFERENCE_MAX_LENGTH,
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
    bankCode: "970415",
    accountName: " Studio Owner ",
    accountNumber: " 123456 ",
    qrObjectKey: null,
    instructions: " Transfer the exact amount. ",
    disclaimer: " Manual review only. ",
  });
  assert.deepEqual(readOrderPaymentSnapshot(snapshot), {
    bankName: "Example Bank",
    bankCode: "970415",
    accountName: "Studio Owner",
    accountNumber: "123456",
    paymentLabel: "Bank transfer",
    qrObjectKey: null,
    instructions: "Transfer the exact amount.",
    disclaimer: "Manual review only.",
  });
});

test("new transfer references remain printable and at most ten characters", () => {
  const generatedReference = "CF12AB34EF";
  assert.equal(
    renderTransferReference("{code}", generatedReference),
    generatedReference,
  );
  assert.equal(
    renderTransferReference("ORDER-{ORDER}", generatedReference),
    generatedReference,
  );
  assert.equal(
    renderTransferReference(
      "{code} {item} {amount}",
      generatedReference,
      "Moon pin",
      "125000",
    ),
    generatedReference,
  );
  assert.equal(renderTransferReference("X{code}", "CYF-ABC"), "XCYF-ABC");
  assert.equal(VIETQR_TRANSFER_REFERENCE_MAX_LENGTH, 10);
  assert.throws(
    () => renderTransferReference("{code}", "CYF-0123456789"),
    /at most ten printable characters/,
  );
});

test("transfer references use ten unambiguous characters from supplied entropy", () => {
  assert.equal(
    generateTransferReference(
      Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 31, 30]),
    ),
    "ABCDEFGH98",
  );
  assert.throws(
    () => generateTransferReference(Uint8Array.from([1, 2, 3])),
    /requires ten random bytes/,
  );
});
