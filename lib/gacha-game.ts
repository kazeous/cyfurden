import type {
  GachaRarity,
  PublishedGachaBanner,
  PublishedGachaDocument,
  PublishedGachaPoolEntry,
} from "@/lib/gacha-document";
import type { GachaRates } from "@/lib/gacha-rates";

const rarityOrder: GachaRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY"];

const rarityRateKey: Record<GachaRarity, keyof GachaRates> = {
  COMMON: "common",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
};

export const gachaRarityRank = Object.freeze({
  COMMON: 0,
  RARE: 1,
  EPIC: 2,
  LEGENDARY: 3,
} satisfies Record<GachaRarity, number>);

function clampRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999_999_999, Math.max(0, value));
}

export function pickWeighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
  randomValue: number,
): T {
  if (!items.length) throw new Error("Cannot pick from an empty lineup.");
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (total <= 0) throw new Error("The lineup weights must be positive.");
  let cursor = clampRandom(randomValue) * total;
  for (const item of items) {
    cursor -= Math.max(0, weight(item));
    if (cursor < 0) return item;
  }
  return items[items.length - 1];
}

export function pickGachaRarity(
  rates: GachaRates,
  availableRarities: readonly GachaRarity[],
  minimumRarity: GachaRarity | null,
  randomValue: number,
): GachaRarity {
  const eligible = rarityOrder.filter(
    (rarity) =>
      availableRarities.includes(rarity) &&
      rates[rarityRateKey[rarity]] > 0 &&
      (!minimumRarity ||
        gachaRarityRank[rarity] >= gachaRarityRank[minimumRarity]),
  );
  return pickWeighted(
    eligible,
    (rarity) => rates[rarityRateKey[rarity]],
    randomValue,
  );
}

export type GachaDrawResult = {
  reward: PublishedGachaPoolEntry;
  pityProgress: number;
  guaranteeApplied: boolean;
};

export function drawGachaReward({
  document,
  banner,
  pityProgress,
  rarityRandom,
  rewardRandom,
}: {
  document: PublishedGachaDocument;
  banner: PublishedGachaBanner;
  pityProgress: number;
  rarityRandom: number;
  rewardRandom: number;
}): GachaDrawResult {
  const safeProgress = Math.max(0, Math.floor(pityProgress));
  const guaranteeApplied =
    document.pityEnabled && safeProgress + 1 >= document.guaranteedAt;
  const rarity = pickGachaRarity(
    document.rates,
    [...new Set(banner.pool.map((entry) => entry.rarity))],
    guaranteeApplied ? document.guaranteedRarity : null,
    rarityRandom,
  );
  const reward = pickWeighted(
    banner.pool.filter((entry) => entry.rarity === rarity),
    (entry) => entry.weight,
    rewardRandom,
  );
  const metGuarantee =
    gachaRarityRank[reward.rarity] >=
    gachaRarityRank[document.guaranteedRarity];
  return {
    reward,
    guaranteeApplied,
    pityProgress:
      document.pityEnabled && !metGuarantee
        ? Math.min(document.guaranteedAt - 1, safeProgress + 1)
        : 0,
  };
}
