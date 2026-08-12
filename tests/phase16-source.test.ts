import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 16 product editor submits a bounded ordered variant manifest", async () => {
  const [form, action, variants] = await Promise.all([
    readSource("app/manage/[boothId]/products/product-form.tsx"),
    readSource("app/manage/[boothId]/actions.ts"),
    readSource("lib/product-variants.ts"),
  ]);

  assert.match(form, /name="variantManifest" value=\{variantManifest\}/);
  assert.match(form, /MAX_PRODUCT_VARIANTS/);
  assert.match(form, /addVariant/);
  assert.match(form, /moveVariant/);
  assert.match(form, /duplicateVariant/);
  assert.match(form, /referencedVariantHidden/);
  assert.match(action, /requireBoothRole\(boothId, editorRoles\)/);
  assert.match(action, /parseProductVariantManifest/);
  assert.match(action, /synchronizeProductVariants/);
  assert.match(action, /isolationLevel: "Serializable"/);
  assert.match(variants, /orderItems: true, gachaPoolItems: true/);
  assert.match(variants, /status: "HIDDEN"/);
  assert.match(variants, /productVariant\.delete/);
});

test("Phase 16 storefront requires a choice for multiple purchasable variants", async () => {
  const [storefront, publicPage] = await Promise.all([
    readSource("components/storefront/managed-storefront.tsx"),
    readSource("app/s/[slug]/page.tsx"),
  ]);

  assert.match(storefront, /if \(purchasable\.length > 1\)/);
  assert.match(storefront, /openDetails\(product\)/);
  assert.match(storefront, /productDetailChooseOptionsCta/);
  assert.match(storefront, /disabled=\{[\s\S]*!isPurchasableVariant/);
  assert.match(storefront, /productPriceFrom/);
  assert.match(publicPage, /variant\.status !== "HIDDEN"/);
});
