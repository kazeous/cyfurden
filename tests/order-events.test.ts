import assert from "node:assert/strict";
import test from "node:test";
import {
  eventDateInput,
  eventPeriod,
  orderEventWhere,
  parseEventDateRange,
  parseOrderViewMode,
  resolveEventSelection,
} from "../lib/order-events";

test("event dates use inclusive Asia/Ho_Chi_Minh calendar days", () => {
  const range = parseEventDateRange("2026-07-30", "2026-07-31");

  assert.ok(range);
  assert.equal(range.startsAt.toISOString(), "2026-07-29T17:00:00.000Z");
  assert.equal(range.endsAt.toISOString(), "2026-07-31T17:00:00.000Z");
  assert.equal(eventDateInput(range.startsAt), "2026-07-30");
  assert.equal(eventDateInput(range.endsAt, true), "2026-07-31");
});

test("event date parsing rejects malformed, impossible, and reversed ranges", () => {
  assert.equal(parseEventDateRange("2026-02-30", "2026-03-01"), null);
  assert.equal(parseEventDateRange("30-07-2026", "31-07-2026"), null);
  assert.equal(parseEventDateRange("2026-08-01", "2026-07-31"), null);
});

test("event period follows half-open boundaries", () => {
  const range = {
    startsAt: new Date("2026-07-29T17:00:00.000Z"),
    endsAt: new Date("2026-07-30T17:00:00.000Z"),
  };

  assert.equal(
    eventPeriod(range, new Date("2026-07-29T16:59:59.999Z")),
    "upcoming",
  );
  assert.equal(eventPeriod(range, range.startsAt), "live");
  assert.equal(eventPeriod(range, range.endsAt), "ended");
});

test("event mode and selection reject unknown query values", () => {
  assert.equal(parseOrderViewMode("events"), "events");
  assert.equal(parseOrderViewMode("unknown"), "queue");
  assert.equal(
    resolveEventSelection("event-2", ["event-1", "event-2"]),
    "event-2",
  );
  assert.equal(resolveEventSelection("foreign-event", ["event-1"]), "ALL");
  assert.deepEqual(orderEventWhere("queue", "event-1"), {});
  assert.deepEqual(orderEventWhere("events", "ALL"), {
    eventId: { not: null },
  });
  assert.deepEqual(orderEventWhere("events", "event-1"), {
    eventId: "event-1",
  });
});
