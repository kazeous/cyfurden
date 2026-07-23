import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canOwnAnotherBooth,
  MAX_OWNED_BOOTHS,
  OWNED_BOOTH_LIMIT_MESSAGE,
} from "../lib/booth-limit";

const dashboardActionPath = new URL(
  "../app/dashboard/actions.ts",
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

test("booth creation enforces the cap in a retried serializable transaction", async () => {
  const source = await readFile(dashboardActionPath, "utf8");

  assert.match(source, /transaction\.booth\.count/);
  assert.match(source, /where: \{ ownerId: session\.user\.id \}/);
  assert.match(source, /canOwnAnotherBooth\(ownedBoothCount\)/);
  assert.match(source, /isolationLevel: "Serializable"/);
  assert.match(source, /error\.code === "P2034"/);
});
