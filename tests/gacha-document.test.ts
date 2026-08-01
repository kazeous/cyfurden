import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bannerAvailability,
  compileGachaDocument,
  readPublishedGachaDocument,
} from "../lib/gacha-document";
import { DEFAULT_GACHA_RATES } from "../lib/gacha-rates";

const config = {
  enabled: true,
  title: "[en]Pocket constellation[/en][vi]Chòm sao bỏ túi[/vi]",
  introduction: "One free digital reveal.",
  gameTheme: "starlight",
  pityEnabled: true,
  guaranteedAt: 10,
  guaranteedRarity: "EPIC" as const,
  rates: DEFAULT_GACHA_RATES,
};

const pool = [
  ["COMMON", 70],
  ["RARE", 24],
  ["EPIC", 5],
  ["LEGENDARY", 1],
].map(([rarity, weight], index) => ({
  id: `entry-${index}`,
  displayName: `Reveal ${index}`,
  rarity: rarity as "COMMON" | "RARE" | "EPIC" | "LEGENDARY",
  weight: Number(weight),
  featured: index > 1,
  sortOrder: index,
  productVariant: {
    label: `Variant ${index}`,
    product: { name: `Product ${index}` },
  },
}));

const banner = {
  id: "banner-1",
  title: "Night market",
  copy: "A small digital surprise.",
  type: "COLLECTION" as const,
  theme: "starlight" as const,
  featuredCount: 2,
  startsAt: null,
  endsAt: null,
  active: true,
  sortOrder: 0,
  pool,
};

test("compileGachaDocument creates a free-only public snapshot", () => {
  const result = compileGachaDocument({
    config,
    banners: [banner],
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.document.resultContract, "DIGITAL_REVEAL_ONLY");
  assert.equal(result.document.banners[0].pool[0].productName, "Product 0");
  assert.deepEqual(
    readPublishedGachaDocument(result.document),
    result.document,
  );
});

test("compileGachaDocument blocks positive odds without a matching tier", () => {
  const result = compileGachaDocument({
    config,
    banners: [
      { ...banner, pool: pool.filter((entry) => entry.rarity !== "RARE") },
    ],
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.errors.join(" "), /rare reveal/i);
});

test("compileGachaDocument blocks disabled and empty publications", () => {
  const result = compileGachaDocument({
    config: { ...config, enabled: false },
    banners: [{ ...banner, active: false }],
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.errors.join(" "), /enable the free game/i);
  assert.match(result.errors.join(" "), /at least one reward banner/i);
});

test("bannerAvailability uses half-open date windows", () => {
  const scheduled = {
    ...banner,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-03T00:00:00.000Z",
    pool: pool.map(({ productVariant, ...entry }) => {
      void productVariant;
      return { ...entry, productName: null, variantLabel: null };
    }),
  };
  assert.equal(
    bannerAvailability(scheduled, new Date("2026-07-31T23:59:59.999Z")),
    "upcoming",
  );
  assert.equal(
    bannerAvailability(scheduled, new Date("2026-08-01T00:00:00.000Z")),
    "live",
  );
  assert.equal(
    bannerAvailability(scheduled, new Date("2026-08-03T00:00:00.000Z")),
    "ended",
  );
});
