import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "../lib/i18n/intl";

test("money formatting follows the selected public locale", () => {
  const english = formatMoney("6000000", "VND", "en");
  const vietnamese = formatMoney("6000000", "VND", "vi");

  assert.match(english, /60,000/);
  assert.match(vietnamese, /60\.000/);
  assert.notEqual(english, vietnamese);
});
