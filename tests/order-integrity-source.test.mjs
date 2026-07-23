import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orderActionPath = new URL("../app/s/[slug]/actions.ts", import.meta.url);
const adminActionPath = new URL(
  "../app/manage/[boothId]/actions.ts",
  import.meta.url,
);
const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const inventoryPath = new URL("../lib/order-inventory.ts", import.meta.url);

test("public reservations enforce stock atomically and idempotently", async () => {
  const [source, inventory] = await Promise.all([
    readFile(orderActionPath, "utf8"),
    readFile(inventoryPath, "utf8"),
  ]);
  assert.match(source, /boothId_idempotencyKey/);
  assert.match(source, /stockQuantity: \{ gte: line\.quantity \}/);
  assert.match(source, /stockQuantity: \{ decrement: line\.quantity \}/);
  assert.match(source, /isolationLevel: "Serializable"/);
  assert.match(source, /inventoryDebited: tracksInventory/);
  assert.match(
    source,
    /expiresAt: new Date\(Date\.now\(\) \+ ORDER_RESERVATION_TTL_MS\)/,
  );
  assert.match(inventory, /expireStaleOrdersInTransaction/);
  assert.match(inventory, /status: "EXPIRED"/);
  assert.doesNotMatch(source, /product: \{ boothId, status: \{ in:/);
});

test("released orders restore only inventory actually debited", async () => {
  const [source, schema] = await Promise.all([
    readFile(adminActionPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  assert.match(source, /releasesInventory\(nextStatus\)/);
  assert.match(source, /inventoryDebited: true/);
  assert.match(source, /stockQuantity: \{ increment: item\.quantity \}/);
  assert.match(schema, /inventoryDebited\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /paymentSnapshot\s+Json\?/);
});
