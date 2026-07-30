import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 8 server-renders the route-owned document language", async () => {
  const [layout, proxy, serverLocale] = await Promise.all([
    readSource("app/layout.tsx"),
    readSource("proxy.ts"),
    readSource("lib/i18n/server-locale.ts"),
  ]);

  assert.match(layout, /readRequestLocale\(\)/);
  assert.match(layout, /<html lang=\{locale\}/);
  assert.match(proxy, /requestPathHeader/);
  assert.match(serverLocale, /publishedDocument/);
  assert.match(serverLocale, /route\.scope === "admin"/);
});

test("Phase 8 auth chrome and form share the selected locale and route", async () => {
  const authPage = await readSource("components/auth/auth-page.tsx");

  assert.match(authPage, /translate\(locale, "publicAuth"\)/);
  assert.match(authPage, /<DocumentLocale locale=\{locale\}/);
  assert.match(authPage, /locale=\{locale\}/);
  assert.match(authPage, /mode === "sign-up" \? "\/sign-up" : "\/sign-in"/);
  assert.match(authPage, /label=\{t\.languageToggleLabel\}/);
  assert.doesNotMatch(authPage, /\bisVi\b/);
});

test("Phase 8 parses seller-authored content across metadata and the public flow", async () => {
  const [page, storefront, reservation, bilingualField] = await Promise.all([
    readSource("app/s/[slug]/page.tsx"),
    readSource("components/storefront/managed-storefront.tsx"),
    readSource("components/storefront/reservation-confirmation.tsx"),
    readSource("components/admin/bilingual-field.tsx"),
  ]);

  assert.match(page, /parseBilingual\(document\.name, document\.locale\)/);
  assert.match(storefront, /const localizedProducts = useMemo/);
  assert.match(storefront, /name: b\(product\.name\)/);
  assert.match(storefront, /label: b\(variant\.label\)/);
  assert.match(reservation, /b\(payment\.instructions\)/);
  assert.match(reservation, /b\(item\.title\)/);
  assert.match(bilingualField, /htmlFor=\{inputId\}/);
  assert.match(bilingualField, /id=\{inputId\}/);
});

test("Phase 8 localizes public mutation feedback", async () => {
  const [orderAction, referenceAction] = await Promise.all([
    readSource("app/s/[slug]/actions.ts"),
    readSource("app/s/[slug]/reservation/[code]/actions.ts"),
  ]);

  assert.match(orderAction, /translate\(actionLocale, "publicBooth"\)/);
  assert.match(orderAction, /strings\.cartActionSaveFailed/);
  assert.match(referenceAction, /"publicReservation"/);
  assert.match(referenceAction, /strings\.referenceSaved/);
});
