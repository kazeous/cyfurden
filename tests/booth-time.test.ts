import assert from "node:assert/strict";
import test from "node:test";
import { parseBoothLocalDateTime } from "../lib/booth-time";

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

test("datetime-local input is read as Vietnam wall-clock time on any host", () => {
  for (const timeZone of hostTimeZones) {
    const [minutes, seconds] = withHostTimeZone(timeZone, () => [
      parseBoothLocalDateTime("2026-08-20T10:00"),
      parseBoothLocalDateTime("2026-08-20T10:00:30"),
    ]);

    assert.equal(minutes?.toISOString(), "2026-08-20T03:00:00.000Z", timeZone);
    assert.equal(seconds?.toISOString(), "2026-08-20T03:00:30.000Z", timeZone);
  }
});

test("datetime-local input crosses the UTC date boundary correctly", () => {
  const parsed = withHostTimeZone("UTC", () =>
    parseBoothLocalDateTime("2026-01-01T05:15"),
  );

  assert.equal(parsed?.toISOString(), "2025-12-31T22:15:00.000Z");
});

test("malformed or zoned datetime input is rejected", () => {
  for (const value of [
    "",
    "tomorrow",
    "2026-08-20",
    "2026-08-20 10:00",
    "2026-08-20T10:00Z",
    "2026-08-20T10:00+07:00",
    "2026-02-30T10:00",
    "2026-08-20T24:00",
    "2026-08-20T10:60",
  ]) {
    assert.equal(parseBoothLocalDateTime(value), null, JSON.stringify(value));
  }
});
