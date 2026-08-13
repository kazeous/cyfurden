import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 17D applies typed quotas atomically to every approved service path", async () => {
  const [policy, quotas, dashboard, team, products, facebooth, transaction] =
    await Promise.all([
      read("lib/platform-policy.ts"),
      read("lib/platform-quotas.ts"),
      read("app/dashboard/actions.ts"),
      read("lib/team-access.ts"),
      read("app/manage/[boothId]/actions.ts"),
      read("lib/facebooth-projects.ts"),
      read("lib/serializable-transaction.ts"),
    ]);

  assert.match(policy, /maxOwnedBooths: 5/);
  assert.match(policy, /maxTeamSeats: 10/);
  assert.match(policy, /maxProducts: 500/);
  assert.match(policy, /maxFaceboothProjects: 100/);
  assert.match(policy, /BigInt\(5\)[\s\S]*BigInt\(1_024\)/);
  assert.match(quotas, /userQuotaOverride/);
  assert.match(quotas, /boothQuotaOverride/);
  assert.match(quotas, /quota\.user\.updated/);
  assert.match(quotas, /quota\.booth\.updated/);
  assert.match(quotas, /quota\.defaults\.updated/);
  assert.match(dashboard, /checkOwnedBoothQuota/);
  assert.match(team, /checkTeamSeatQuota/);
  assert.match(products, /checkProductQuota/);
  assert.match(facebooth, /checkFaceboothProjectQuota/);
  assert.match(transaction, /isolationLevel: "Serializable"/);
  assert.match(transaction, /P2034/);
});

test("Phase 17D reserves, verifies, attaches, deletes, and reconciles Oracle bytes", async () => {
  const [
    ledger,
    presign,
    uploads,
    productActions,
    facebooth,
    reconciliation,
    oracleReconciliation,
  ] = await Promise.all([
    read("lib/storage-ledger.ts"),
    read("lib/oracle-presign.ts"),
    read("lib/oracle-uploads.ts"),
    read("app/manage/[boothId]/actions.ts"),
    read("lib/facebooth-projects.ts"),
    read("lib/storage-reconciliation.ts"),
    read("lib/storage-reconciliation-oracle.ts"),
  ]);

  assert.match(ledger, /reserveStorageAsset/);
  assert.match(ledger, /verifyReservedStorageAsset/);
  assert.match(ledger, /attachStorageAssets/);
  assert.match(ledger, /detachStorageAssets/);
  assert.match(ledger, /DELETION_PENDING/);
  assert.match(ledger, /reservationExpiresAt: \{ lte: now \}/);
  assert.match(presign, /await reserveStorageAsset/);
  assert.match(presign, /await verifyReservedStorageAsset/);
  assert.match(uploads, /await recordStorageDeletionResult/);
  assert.match(productActions, /associatedRecordType: "ProductImage"/);
  assert.match(facebooth, /associatedRecordType: "FaceboothProject"/);
  assert.match(reconciliation, /STORAGE_RECONCILIATION_PAGE_SIZE = 250/);
  assert.match(oracleReconciliation, /ListObjectsV2Command/);
  assert.match(oracleReconciliation, /HeadObjectCommand/);
  assert.match(reconciliation, /state: reference \? "VERIFIED" : "ORPHANED"/);
  assert.match(reconciliation, /state: "MISSING"/);
  assert.doesNotMatch(reconciliation, /DeleteObjectCommand/);
});

test("Phase 17D exposes bilingual bounded controls without leaking full object keys or enabling Phase 17E", async () => {
  const [actions, controls, boothPage, inventory, catalogue] =
    await Promise.all([
      read("app/admin/actions.ts"),
      read("components/platform-admin/platform-resource-controls.tsx"),
      read("app/admin/booths/[boothId]/page.tsx"),
      read("lib/platform-inventory.ts"),
      read("lib/i18n/platform-admin.ts"),
    ]);

  assert.match(actions, /platformUserQuotaAction/);
  assert.match(actions, /platformDefaultQuotaAction/);
  assert.match(actions, /platformBoothQuotaAction/);
  assert.match(actions, /platformStorageReconciliationAction/);
  assert.match(controls, /maxLength=\{500\}/);
  assert.match(controls, /maxStorageMiB/);
  assert.match(boothPage, /safeObjectKey/);
  assert.doesNotMatch(boothPage, /asset\.objectKey/);
  assert.match(inventory, /objectName\.slice\(-36\)/);
  assert.match(catalogue, /Manual Oracle reconciliation/);
  assert.match(catalogue, /Đối soát Oracle thủ công/);
  assert.doesNotMatch(actions, /health|uptime|probe/i);
});

test("Phase 17D keeps media, document, and money safety caps non-overridable", async () => {
  const [payment, variants, faceboothDocuments, productFields, quotas] =
    await Promise.all([
      read("lib/payment-qr.ts"),
      read("lib/product-variants.ts"),
      read("lib/facebooth-documents.ts"),
      read("lib/product-fields.ts"),
      read("lib/platform-quotas.ts"),
    ]);

  assert.match(payment, /PRODUCT_IMAGE_MAX_COUNT = 8/);
  assert.match(variants, /MAX_PRODUCT_VARIANTS = 50/);
  assert.match(faceboothDocuments, /FACEBOOTH_DOCUMENT_MAX_BYTES/);
  assert.match(productFields, /MAX_PRODUCT_PRICE_VND/);
  assert.doesNotMatch(quotas, /MAX_PRODUCT_VARIANTS|MAX_PRODUCT_PRICE_VND/);
});
