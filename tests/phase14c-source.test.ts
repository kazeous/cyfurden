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
