import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidProductSku,
  MAX_PRODUCT_PRICE_VND,
  normalizeProductSku,
  parseWholeVndPrice,
} from "../lib/product-fields";

test("product SKUs retain Vietnamese diacritics and spaces", () => {
  const sku = normalizeProductSku("  bưu thiếp mùa hè 01  ");
  assert.equal(sku, "BƯU THIẾP MÙA HÈ 01");
  assert.equal(isValidProductSku(sku), true);
  assert.equal(isValidProductSku("SKU/INVALID"), false);
});

test("product prices accept every bounded whole-number VND amount", () => {
  assert.equal(parseWholeVndPrice("500969"), 500_969);
  assert.equal(parseWholeVndPrice("0"), 0);
  assert.equal(
    parseWholeVndPrice(String(MAX_PRODUCT_PRICE_VND)),
    MAX_PRODUCT_PRICE_VND,
  );
  assert.equal(parseWholeVndPrice("500.969"), null);
  assert.equal(parseWholeVndPrice("500969.5"), null);
  assert.equal(parseWholeVndPrice(String(MAX_PRODUCT_PRICE_VND + 1)), null);
});
