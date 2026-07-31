import assert from "node:assert/strict";
import test from "node:test";
import {
  isNewPendingOrder,
  orderAlertsStorageKey,
  type LatestOrderSignal,
} from "../lib/order-alerts";

const signal = (
  id: string,
  placedAt: string,
  status = "PENDING",
): LatestOrderSignal => ({
  id,
  code: `CYF-${id}`,
  placedAt,
  status,
});

test("order alert preference is isolated per booth", () => {
  assert.equal(
    orderAlertsStorageKey("booth-a"),
    "cyfurden:order-alerts:booth-a",
  );
  assert.notEqual(orderAlertsStorageKey("booth-a"), orderAlertsStorageKey("b"));
});

test("a newly observed pending reservation triggers an alert", () => {
  assert.equal(
    isNewPendingOrder(null, signal("one", "2026-07-31T10:00:00.000Z")),
    true,
  );
  assert.equal(
    isNewPendingOrder(
      signal("one", "2026-07-31T10:00:00.000Z"),
      signal("two", "2026-07-31T10:00:01.000Z"),
    ),
    true,
  );
});

test("refreshes and status transitions never masquerade as a new order", () => {
  const pending = signal("one", "2026-07-31T10:00:00.000Z");
  assert.equal(isNewPendingOrder(pending, pending), false);
  assert.equal(
    isNewPendingOrder(
      pending,
      signal("one", "2026-07-31T10:00:00.000Z", "CONFIRMED"),
    ),
    false,
  );
  assert.equal(
    isNewPendingOrder(pending, signal("older", "2026-07-31T09:59:59.000Z")),
    false,
  );
});
