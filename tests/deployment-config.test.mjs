import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Prisma client generation does not require a build-time database secret", async () => {
  const [configSource, packageSource] = await Promise.all([
    readFile(new URL("../prisma.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(packageJson.scripts.postinstall, "prisma generate");
  assert.match(
    configSource,
    /url:\s*process\.env\.DATABASE_URL\s*\?\?\s*["']{2}/,
  );
  assert.doesNotMatch(configSource, /env\(["']DATABASE_URL["']\)/);
});
