import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 7 keeps only destination-owned new=1 query parameters", async () => {
  const [dashboardActions, gachaPage, productsPage, storefrontPage] =
    await Promise.all([
      readSource("app/dashboard/actions.ts"),
      readSource("app/manage/[boothId]/gacha/page.tsx"),
      readSource("app/manage/[boothId]/products/page.tsx"),
      readSource("app/manage/[boothId]/storefront/page.tsx"),
    ]);

  assert.doesNotMatch(dashboardActions, /\?new=1/);
  assert.match(gachaPage, /filters\.new/);
  assert.match(gachaPage, /gacha\?new=1/);
  assert.match(gachaPage, /products\?new=1/);
  assert.match(productsPage, /filters\.new === "1"/);
  assert.doesNotMatch(storefrontPage, /\bnew\b/);
});

test("Phase 7 gacha creation paths keep canonical lowercase rates", async () => {
  const [dashboardActions, manageActions] = await Promise.all([
    readSource("app/dashboard/actions.ts"),
    readSource("app/manage/[boothId]/actions.ts"),
  ]);

  assert.match(dashboardActions, /DEFAULT_GACHA_RATES/);
  assert.match(manageActions, /parseGachaRatesInput/);
  assert.doesNotMatch(`${dashboardActions}${manageActions}`, /\bCOMMON\s*:/);
});

test("Phase 7 defect cleanup stays wired", async () => {
  const [storefront, reservationPage, adminShell] = await Promise.all([
    readSource("components/storefront/managed-storefront.tsx"),
    readSource("app/s/[slug]/reservation/[code]/page.tsx"),
    readSource("components/admin/admin-shell.tsx"),
  ]);

  assert.doesNotMatch(`${storefront}${reservationPage}`, /Ã—|âˆ’|Ãƒ|Ã¢/);
  assert.doesNotMatch(reservationPage, /Reservation received\s*·\s*Cyfurden/);
  assert.doesNotMatch(adminShell, /export function MetricCard/);
});

test("Phase 7 cart and social QR accessibility wiring remains present", async () => {
  const [storefront, socialQr] = await Promise.all([
    readSource("components/storefront/managed-storefront.tsx"),
    readSource("lib/social-qr.ts"),
  ]);

  assert.match(storefront, /removeCartLine\(current, variantId\)/);
  assert.match(storefront, /pendingCartFocusRef/);
  assert.match(storefront, /aria-live="polite"/);
  assert.match(storefront, /SKU \{featuredProduct\.sku\}/);
  assert.match(storefront, /SKU \{product\.sku\}/);
  assert.match(storefront, /styles\.infoQrLogo/);
  assert.doesNotMatch(socialQr, /canvas|crossOrigin|centerLogoUrl/);
});
