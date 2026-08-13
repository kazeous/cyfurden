import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canOwnAnotherBooth,
  countOwnedBooths,
  MAX_OWNED_BOOTHS,
  OWNED_BOOTH_LIMIT_MESSAGE,
} from "../lib/booth-limit";

const dashboardActionPath = new URL(
  "../app/dashboard/actions.ts",
  import.meta.url,
);
const quotaServicePath = new URL("../lib/platform-quotas.ts", import.meta.url);
const serializablePath = new URL(
  "../lib/serializable-transaction.ts",
  import.meta.url,
);

test("an owner can create booths until reaching the five-booth cap", () => {
  assert.equal(MAX_OWNED_BOOTHS, 5);
  assert.equal(canOwnAnotherBooth(0), true);
  assert.equal(canOwnAnotherBooth(4), true);
  assert.equal(canOwnAnotherBooth(5), false);
  assert.equal(canOwnAnotherBooth(6), false);
});

test("the ownership limit has a clear user-facing message", () => {
  assert.match(OWNED_BOOTH_LIMIT_MESSAGE, /up to 5 booths/i);
});

test("dashboard ownership is derived from the booth owner, not membership role", () => {
  assert.equal(
    countOwnedBooths("user-1", [
      { ownerId: "user-1" },
      { ownerId: "user-2" },
      { ownerId: "user-1" },
    ]),
    2,
  );
});

test("booth creation enforces the cap in a retried serializable transaction", async () => {
  const source = await readFile(dashboardActionPath, "utf8");
  const quotaSource = await readFile(quotaServicePath, "utf8");
  const transactionSource = await readFile(serializablePath, "utf8");

  assert.match(
    source,
    /checkOwnedBoothQuota\(transaction, session\.user\.id\)/,
  );
  assert.match(source, /runSerializableTransaction/);
  assert.match(quotaSource, /transaction\.booth\.count/);
  assert.match(quotaSource, /where: \{ ownerId: userId \}/);
  assert.match(transactionSource, /isolationLevel: "Serializable"/);
  assert.match(transactionSource, /error\.code === "P2034"/);
});
