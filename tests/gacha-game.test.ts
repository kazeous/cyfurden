import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublishedGachaDocument } from "../lib/gacha-document";
import { drawGachaReward, pickWeighted } from "../lib/gacha-game";

const pool = [
  {
    id: "common",
    displayName: "Common reveal",
    productName: null,
    variantLabel: null,
    rarity: "COMMON" as const,
    weight: 1,
    featured: false,
    sortOrder: 0,
  },
  {
    id: "epic-light",
    displayName: "Epic light",
    productName: null,
    variantLabel: null,
    rarity: "EPIC" as const,
    weight: 1,
    featured: true,
    sortOrder: 1,
  },
  {
    id: "epic-heavy",
    displayName: "Epic heavy",
    productName: null,
    variantLabel: null,
    rarity: "EPIC" as const,
    weight: 9,
    featured: true,
    sortOrder: 2,
  },
];

const document = {
  version: 1,
  publishedAt: "2026-08-01T00:00:00.000Z",
  title: "Free reveal",
  introduction: "Digital only.",
  gameTheme: "anemo",
  pityEnabled: true,
  guaranteedAt: 3,
  guaranteedRarity: "EPIC",
  rates: { common: 90, rare: 0, epic: 10, legendary: 0 },
  banners: [
    {
      id: "banner",
      title: "Banner",
      copy: "Copy",
      type: "COLLECTION",
      theme: "anemo",
      featuredCount: 2,
      startsAt: null,
      endsAt: null,
      sortOrder: 0,
      pool,
    },
  ],
  resultContract: "DIGITAL_REVEAL_ONLY",
} satisfies PublishedGachaDocument;

test("pickWeighted respects item weights", () => {
  assert.equal(
    pickWeighted(pool.slice(1), (entry) => entry.weight, 0.05).id,
    "epic-light",
  );
  assert.equal(
    pickWeighted(pool.slice(1), (entry) => entry.weight, 0.5).id,
    "epic-heavy",
  );
});

test("the guarantee forces the configured rarity and resets progress", () => {
  const result = drawGachaReward({
    document,
    banner: document.banners[0],
    pityProgress: 2,
    rarityRandom: 0,
    rewardRandom: 0.5,
  });
  assert.equal(result.guaranteeApplied, true);
  assert.equal(result.reward.id, "epic-heavy");
  assert.equal(result.pityProgress, 0);
});

test("ordinary common reveals advance local guarantee progress", () => {
  const result = drawGachaReward({
    document,
    banner: document.banners[0],
    pityProgress: 0,
    rarityRandom: 0,
    rewardRandom: 0,
  });
  assert.equal(result.guaranteeApplied, false);
  assert.equal(result.reward.rarity, "COMMON");
  assert.equal(result.pityProgress, 1);
});
