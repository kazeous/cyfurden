import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 13 links the landing to the maintained demo in both locales", async () => {
  const [landing, catalogue, english, vietnamese] = await Promise.all([
    readSource("app/page.tsx"),
    readSource("lib/i18n/catalogue.ts"),
    readSource("lib/i18n/en.ts"),
    readSource("lib/i18n/vi.ts"),
  ]);

  assert.match(landing, /DEMO_BOOTH_PATH/);
  assert.match(landing, /landing\.heroActionDemo/);
  assert.match(landing, /landing\.finalDemo/);
  assert.match(landing, /landing\.footerDemo/);
  assert.match(catalogue, /heroActionDemo: string/);
  assert.match(english, /heroActionDemo: "Visit demo booth"/);
  assert.match(vietnamese, /heroActionDemo: "Xem booth demo"/);
});

test("Phase 13 reserves the demo identity and exposes an explicit seed command", async () => {
  const [identity, actions, seed, runner, packageJson] = await Promise.all([
    readSource("lib/demo-booth.ts"),
    readSource("app/dashboard/actions.ts"),
    readSource("lib/demo-booth-seed.ts"),
    readSource("scripts/seed-demo-booth.ts"),
    readSource("package.json"),
  ]);

  assert.match(identity, /DEMO_BOOTH_SLUG = "cyfurden-demo"/);
  assert.match(actions, /isReservedBoothSlug/);
  assert.match(seed, /assertDemoIdentity/);
  assert.match(seed, /isolationLevel: "Serializable"/);
  assert.match(seed, /compileGachaDocument/);
  assert.match(seed, /No purchase, prize, or item entitlement/);
  assert.doesNotMatch(seed, /transaction\.order\.(?:create|update|delete)/);
  assert.doesNotMatch(seed, /Lantern & Loom|lantern-and-loom/i);
  assert.match(runner, /seedDemoBooth/);
  assert.match(
    packageJson,
    /"db:seed:demo": "tsx scripts\/seed-demo-booth\.ts"/,
  );
});
