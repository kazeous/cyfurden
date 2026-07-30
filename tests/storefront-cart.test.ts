import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearCart,
  removeLine,
  type StorefrontCartLine,
} from "../lib/storefront-cart";

const base: StorefrontCartLine[] = [
  { productId: "p1", variantId: "v1", quantity: 2 },
  { productId: "p2", variantId: "v2", quantity: 3 },
];

test("removeLine drops the targeted variant line", () => {
  const next = removeLine(base, "v1");
  assert.deepEqual(next, [{ productId: "p2", variantId: "v2", quantity: 3 }]);
});

test("removeLine returns the same lines when the variant is unknown", () => {
  const next = removeLine(base, "v9");
  assert.deepEqual(next, base);
});

test("removeLine is pure and never mutates the input", () => {
  const copy = base.map((line) => ({ ...line }));
  removeLine(base, "v1");
  assert.deepEqual(base, copy);
});

test("clearCart returns an empty array", () => {
  assert.deepEqual(clearCart(), []);
});
