import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 14C separates promotions without changing pricing contracts", async () => {
  const [products, promotions, editor, actions, storefront, orderAction] =
    await Promise.all([
      readSource("app/manage/[boothId]/products/page.tsx"),
      readSource("app/manage/[boothId]/promotions/page.tsx"),
      readSource("app/manage/[boothId]/products/promotion-editor.tsx"),
      readSource("app/manage/[boothId]/actions.ts"),
      readSource("components/storefront/managed-storefront.tsx"),
      readSource("app/s/[slug]/actions.ts"),
    ]);

  assert.doesNotMatch(products, /PromotionEditor|quantityPromotion/);
  assert.match(promotions, /requireBoothSection\(boothId, "promotions"\)/);
  assert.match(promotions, /<PromotionEditor/);
  assert.match(editor, /name="buyProductIds"/);
  assert.match(editor, /name="rewardProductIds"/);
  assert.match(actions, /promotion\.saved/);
  assert.match(storefront, /applyQuantityPromotions/);
  assert.match(orderAction, /applyQuantityPromotions/);
});

test("Phase 14C prepares ordinary images and preserves QR bytes", async () => {
  const [preparation, productForm, logo, qr, presign] = await Promise.all([
    readSource("lib/image-preparation.ts"),
    readSource("app/manage/[boothId]/products/product-form.tsx"),
    readSource("components/admin/booth-identity-controls.tsx"),
    readSource("lib/oracle-uploads.ts"),
    readSource("lib/oracle-presign-contract.ts"),
  ]);

  assert.match(preparation, /ORDINARY_IMAGE_LONGEST_EDGE = 2_560/);
  assert.match(preparation, /quality: OPAQUE_WEBP_QUALITY/);
  assert.match(preparation, /lossless: lossless \? 1 : 0/);
  assert.match(preparation, /canvasToBlob\(canvas, "image\/png"\)/);
  assert.match(productForm, /prepareOrdinaryImage/);
  assert.match(logo, /prepareOrdinaryImage/);
  assert.match(presign, /20 \* 1024 \* 1024/);
  assert.doesNotMatch(qr, /prepareOrdinaryImage|canvas|encodeWebp/);
});

test("Phase 14C keeps cart additions quiet and checkout explicit", async () => {
  const [storefront, styles] = await Promise.all([
    readSource("components/storefront/managed-storefront.tsx"),
    readSource("components/storefront/managed-storefront.module.css"),
  ]);
  const addFunction = storefront.slice(
    storefront.indexOf("  const add ="),
    storefront.indexOf("  const openDetails ="),
  );

  assert.doesNotMatch(addFunction, /setCartOpen/);
  assert.match(storefront, /cartSummaryLines/);
  assert.match(storefront, /checkoutOpen/);
  assert.match(storefront, /setCheckoutOpen\(true\)/);
  assert.match(storefront, /<CartIcon/);
  assert.doesNotMatch(storefront, /styles\.artLabel/);
  assert.doesNotMatch(storefront, /styles\.skuChip/);
  assert.match(styles, /266px/);
});

test("public controls retain mobile-safe targets, labels, and stacking", async () => {
  const [landing, auth, languageToggle, storefront] = await Promise.all([
    readSource("app/landing.module.css"),
    readSource("components/auth/auth.module.css"),
    readSource("components/landing/language-toggle.module.css"),
    readSource("components/storefront/managed-storefront.module.css"),
  ]);

  assert.match(
    landing,
    /\.siteHeader nav \{[\s\S]*display: flex;[\s\S]*justify-content: space-between;/,
  );
  assert.match(auth, /\.headerActions \{[\s\S]*min-width: 0;/);
  assert.match(auth, /\.storefrontLink \{[\s\S]*white-space: nowrap;/);
  assert.match(languageToggle, /min-height: 44px/);
  assert.match(languageToggle, /font-size: var\(--text-sm\)/);
  assert.match(storefront, /\.topbar \{[\s\S]*z-index: var\(--z-sticky\)/);
  assert.match(storefront, /\.close \{[\s\S]*flex: 0 0 44px;/);
  assert.match(storefront, /\.productTitle \{[\s\S]*min-height: 44px;/);
  assert.match(
    storefront,
    /\.detailsButton \{[\s\S]*font-size: var\(--text-sm\)/,
  );
});

test("product index controls keep a symmetric 44px rhythm", async () => {
  const products = await readSource(
    "app/manage/[boothId]/products/products.module.css",
  );

  assert.match(
    products,
    /\.filterLink \{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;/,
  );
  assert.match(
    products,
    /\.table \{[\s\S]*font-variant-numeric: tabular-nums;[\s\S]*table-layout: fixed;/,
  );
  assert.match(
    products,
    /\.formGrid > \.field \{[\s\S]*grid-template-rows: auto 44px minmax\(1\.45em, auto\);/,
  );
  assert.match(
    products,
    /\.field input,[\s\S]*\.field select \{[\s\S]*height: 44px;/,
  );
});
