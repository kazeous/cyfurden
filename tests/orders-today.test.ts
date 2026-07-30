import assert from "node:assert/strict";
import test from "node:test";
import { hoChiMinhTodayWindow, parseTodayQuery } from "../lib/orders-today";

test("Today uses the Asia/Ho_Chi_Minh calendar-day boundary", () => {
  const window = hoChiMinhTodayWindow(new Date("2026-07-30T12:00:00.000Z"));

  assert.equal(window.gte.toISOString(), "2026-07-29T17:00:00.000Z");
  assert.equal(window.lt.toISOString(), "2026-07-30T17:00:00.000Z");
});

test("Today rolls over exactly at Ho Chi Minh City midnight", () => {
  const beforeMidnight = hoChiMinhTodayWindow(
    new Date("2026-07-30T16:59:59.999Z"),
  );
  const atMidnight = hoChiMinhTodayWindow(new Date("2026-07-30T17:00:00.000Z"));

  assert.equal(beforeMidnight.gte.toISOString(), "2026-07-29T17:00:00.000Z");
  assert.equal(atMidnight.gte.toISOString(), "2026-07-30T17:00:00.000Z");
});

test("only the explicit today=1 query activates Today", () => {
  assert.equal(parseTodayQuery("1"), true);
  assert.equal(parseTodayQuery(["1", "0"]), true);
  assert.equal(parseTodayQuery("true"), false);
  assert.equal(parseTodayQuery("0"), false);
  assert.equal(parseTodayQuery(undefined), false);
});
