import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 12 publishes snapshots and supports explicit unpublish", async () => {
  const [actions, page, publicPage] = await Promise.all([
    readSource("app/manage/[boothId]/actions.ts"),
    readSource("app/manage/[boothId]/gacha/page.tsx"),
    readSource("app/s/[slug]/page.tsx"),
  ]);
  assert.match(actions, /compileGachaDocument/);
  assert.match(actions, /gacha\.published/);
  assert.match(actions, /gacha\.unpublished/);
  assert.match(actions, /publishedDocument: Prisma\.DbNull/);
  assert.match(page, /publishGachaAction/);
  assert.match(publicPage, /readPublishedGachaDocument/);
});

test("Phase 12 public play is free digital reveal only", async () => {
  const [component, document, game] = await Promise.all([
    readSource("components/storefront/free-gacha.tsx"),
    readSource("lib/gacha-document.ts"),
    readSource("lib/gacha-game.ts"),
  ]);
  assert.match(document, /DIGITAL_REVEAL_ONLY/);
  assert.match(component, /gachaDigitalOnly/);
  assert.match(component, /localStorage/);
  assert.doesNotMatch(
    `${component}${game}`,
    /createPublicOrderAction|priceCents|stockQuantity|payment|checkout|claimCode/,
  );
});

test("Phase 12 exposes persisted rarity odds, weights, dates, and guarantee", async () => {
  const [actions, page] = await Promise.all([
    readSource("app/manage/[boothId]/actions.ts"),
    readSource("app/manage/[boothId]/gacha/page.tsx"),
  ]);
  assert.match(actions, /parseGachaRatesInput/);
  assert.match(actions, /guaranteedRarity/);
  assert.match(actions, /parseEventDateRange/);
  assert.match(actions, /`rarity:\$\{variant\.id\}`/);
  assert.match(actions, /`weight:\$\{variant\.id\}`/);
  assert.match(page, /rateLegendary/);
  assert.match(page, /startDate/);
  assert.match(page, /FreeGacha/);
});
