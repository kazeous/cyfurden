import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 14D keeps the final order desk surfaces role-scoped and manual", async () => {
  const [detail, payments, shipping, orderAdmin, dependencies] =
    await Promise.all([
      readSource("app/manage/[boothId]/orders/[orderId]/page.tsx"),
      readSource("app/manage/[boothId]/payments/page.tsx"),
      readSource("app/manage/[boothId]/shipping/page.tsx"),
      readSource("lib/order-admin.ts"),
      readSource("package.json"),
    ]);

  assert.match(detail, /requireBoothSection\(boothId, "orders"\)/);
  assert.match(detail, /readOrderDetailForMember/);
  assert.match(payments, /requireBoothSection\(boothId, "payments"\)/);
  assert.match(payments, /readPaymentReceiptsForManager/);
  assert.match(shipping, /requireBoothSection\(boothId, "shipping"\)/);
  assert.match(shipping, /readShippingOrdersForManager/);
  assert.match(shipping, /readOrderDetailForManager/);
  assert.match(orderAdmin, /const managerRoles = \["OWNER", "ADMIN"\]/);
  assert.match(
    orderAdmin,
    /const orderDeskRoles = \["OWNER", "ADMIN", "STAFF"\]/,
  );
  assert.match(orderAdmin, /action: "order\.shipment_updated"/);
  assert.doesNotMatch(orderAdmin, /\bfetch\s*\(/);
  assert.doesNotMatch(
    dependencies,
    /"(?:stripe|paypal|bullmq|ioredis|nodemailer|twilio)"\s*:/i,
  );
});

test("Phase 14D retains migration constraints and bounded references", async () => {
  const [migration, fulfillment, orderRules, publicAction] = await Promise.all([
    readSource(
      "prisma/migrations/0012_phase14a_order_fulfillment_contracts/migration.sql",
    ),
    readSource("lib/order-fulfillment.ts"),
    readSource("lib/order-rules.ts"),
    readSource("app/s/[slug]/actions.ts"),
  ]);

  for (const constraint of [
    "Order_phase14_phone_check",
    "Order_phase14_social_contact_check",
    "Order_phase14_shipping_address_check",
    "Order_phase14_transfer_reference_check",
    "Order_phase14_shipment_scope_check",
    "Order_phase14_shipment_values_check",
  ]) {
    assert.match(migration, new RegExp(constraint));
  }
  assert.match(migration, /'\^\[ -~\]\{1,10\}\$'/);
  assert.match(fulfillment, /CUSTOMER_PHONE_MAX_DIGITS = 10/);
  assert.match(fulfillment, /fulfillmentMethod: z\.enum/);
  assert.match(orderRules, /VIETQR_TRANSFER_REFERENCE_MAX_LENGTH = 10/);
  assert.match(orderRules, /generateTransferReference/);
  assert.match(publicAction, /publicOrderFulfillmentSchema\.safeParse/);
});

test("Phase 14D verifies prepared MIME, length, and real Oracle bytes", async () => {
  const [
    preparation,
    productForm,
    logo,
    presign,
    verifier,
    oracleImage,
    validation,
  ] = await Promise.all([
    readSource("lib/image-preparation.ts"),
    readSource("app/manage/[boothId]/products/product-form.tsx"),
    readSource("components/admin/booth-identity-controls.tsx"),
    readSource("lib/oracle-presign-contract.ts"),
    readSource("lib/oracle-presign.ts"),
    readSource("lib/oracle-image-verification.ts"),
    readSource("lib/payment-qr.ts"),
  ]);

  assert.match(preparation, /prepareOrdinaryImage/);
  assert.match(productForm, /uploadProductImageDirect\(\s*preparedFile/);
  assert.match(productForm, /contentType: file\.type/);
  assert.match(productForm, /contentLength: file\.size/);
  assert.match(logo, /contentType: preparedFile\.type/);
  assert.match(logo, /contentLength: preparedFile\.size/);
  assert.match(presign, /20 \* 1024 \* 1024/);
  assert.match(verifier, /result\.Body\.transformToByteArray\(\)/);
  assert.match(verifier, /inspectOracleImageBytes/);
  assert.match(oracleImage, /validateProductImageBytes/);
  assert.match(oracleImage, /declaredContentType === image\.contentType/);
  assert.match(validation, /bytes\.byteLength > PRODUCT_IMAGE_MAX_BYTES/);
});
