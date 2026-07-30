import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_GACHA_RATES, readGachaRates } from "../lib/gacha-rates";

test("DEFAULT_GACHA_RATES uses the canonical lowercase 100-point shape", () => {
  assert.deepEqual(DEFAULT_GACHA_RATES, {
    common: 70,
    rare: 24,
    epic: 5,
    legendary: 1,
  });
});

test("readGachaRates normalizes legacy uppercase keys without mutating input", () => {
  const legacy = { COMMON: 80, RARE: 15, EPIC: 4, LEGENDARY: 1 };
  const result = readGachaRates(legacy);
  assert.deepEqual(result.value, DEFAULT_GACHA_RATES);
  assert.equal(result.usedLegacyKeys, true);
});

test("readGachaRates accepts the canonical lowercase shape", () => {
  const result = readGachaRates(DEFAULT_GACHA_RATES);
  assert.deepEqual(result.value, DEFAULT_GACHA_RATES);
  assert.equal(result.usedLegacyKeys, false);
});

test("readGachaRates falls back to defaults for missing keys", () => {
  const result = readGachaRates({ common: 50 });
  assert.deepEqual(result.value, DEFAULT_GACHA_RATES);
});
