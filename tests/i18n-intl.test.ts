import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoothDateTimeFormat,
  formatDate,
  formatDateTime,
  formatMoney,
} from "../lib/i18n/intl";

test("money formatting follows the selected public locale", () => {
  const english = formatMoney("6000000", "VND", "en");
  const vietnamese = formatMoney("6000000", "VND", "vi");

  assert.match(english, /60,000/);
  assert.match(vietnamese, /60\.000/);
  assert.notEqual(english, vietnamese);
});

// Production containers usually run in UTC while developer machines in
// Vietnam run in UTC+7, so booth time must never depend on the host zone.
const hostTimeZones = ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh"];

const withHostTimeZone = <T>(timeZone: string, run: () => T): T => {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
};

// 17:30 UTC on 19 August is 00:30 on 20 August in Vietnam (UTC+7).
const lateEveningUtc = new Date("2026-08-19T17:30:00.000Z");

test("booth timestamps render Vietnam wall-clock time on any host", () => {
  for (const timeZone of hostTimeZones) {
    const [english, vietnamese] = withHostTimeZone(timeZone, () => [
      formatDateTime(lateEveningUtc, "en"),
      formatDateTime(lateEveningUtc, "vi"),
    ]);

    assert.match(english, /20 Aug 2026/, `${timeZone} host: ${english}`);
    assert.match(english, /00:30/, `${timeZone} host: ${english}`);
    assert.match(vietnamese, /20 thg 8/, `${timeZone} host: ${vietnamese}`);
    assert.match(vietnamese, /2026/, `${timeZone} host: ${vietnamese}`);
    assert.match(vietnamese, /00:30/, `${timeZone} host: ${vietnamese}`);
  }
});

test("booth calendar dates use the Vietnam day on any host", () => {
  for (const timeZone of hostTimeZones) {
    const rendered = withHostTimeZone(timeZone, () =>
      formatDate(lateEveningUtc, "en"),
    );

    assert.match(rendered, /^20 Aug 2026$/, `${timeZone} host: ${rendered}`);
  }
});

test("custom booth date formats are pinned to Vietnam time", () => {
  const rendered = withHostTimeZone("UTC", () =>
    createBoothDateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(lateEveningUtc),
  );

  assert.equal(rendered, "00:30");
});
