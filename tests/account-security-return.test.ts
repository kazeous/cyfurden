import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlatformSecurityReturnTo } from "../lib/platform-security-return";

test("platform security returns preserve an exact safe admin target", () => {
  assert.equal(normalizePlatformSecurityReturnTo("/admin"), "/admin");
  assert.equal(
    normalizePlatformSecurityReturnTo(
      "/admin/booths?status=PAUSED&view=compact#inventory",
    ),
    "/admin/booths?status=PAUSED&view=compact#inventory",
  );
});

test("platform security returns reject external and ambiguous targets", () => {
  for (const value of [
    null,
    ["/admin"],
    "https://example.com/admin",
    "//example.com/admin",
    "/administrator",
    "/administer/settings",
    "/admin%2f%2fevil.example",
    "/admin\n/settings",
    `/admin?${"x".repeat(501)}`,
  ]) {
    assert.equal(normalizePlatformSecurityReturnTo(value), null);
  }
});
