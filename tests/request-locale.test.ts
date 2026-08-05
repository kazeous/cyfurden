import assert from "node:assert/strict";
import test from "node:test";
import { localeRouteForPath } from "@/lib/i18n/request-path";

test("landing and auth routes use the visitor site language", () => {
  assert.deepEqual(localeRouteForPath("/"), { scope: "site" });
  assert.deepEqual(localeRouteForPath("/sign-in"), { scope: "site" });
  assert.deepEqual(localeRouteForPath("/sign-up"), { scope: "site" });
});

test("public booth and reservation routes use the published booth language", () => {
  assert.deepEqual(localeRouteForPath("/s/moon-rabbit"), {
    scope: "booth",
    slug: "moon-rabbit",
  });
  assert.deepEqual(
    localeRouteForPath("/s/moon-rabbit/reservation/CYF-0123456789"),
    {
      scope: "booth",
      slug: "moon-rabbit",
    },
  );
});

test("workspace routes use the private-workspace locale scope", () => {
  assert.deepEqual(localeRouteForPath("/dashboard"), { scope: "admin" });
  assert.deepEqual(localeRouteForPath("/manage/booth/orders"), {
    scope: "admin",
  });
  assert.deepEqual(localeRouteForPath(null), { scope: "admin" });
});

test("malformed encoded booth paths never escape into a locale lookup", () => {
  assert.deepEqual(localeRouteForPath("/s/%E0%A4%A"), { scope: "admin" });
});
