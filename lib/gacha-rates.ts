export const DEFAULT_GACHA_RATES = Object.freeze({
  common: 70,
  rare: 24,
  epic: 5,
  legendary: 1,
});

type RateRecord = Record<keyof typeof DEFAULT_GACHA_RATES, number>;

const KEY_ALIASES: Record<string, keyof typeof DEFAULT_GACHA_RATES> = {
  common: "common",
  COMMON: "common",
  rare: "rare",
  RARE: "rare",
  epic: "epic",
  EPIC: "epic",
  legendary: "legendary",
  LEGENDARY: "legendary",
};

export function readGachaRates(value: unknown): {
  value: RateRecord;
  usedLegacyKeys: boolean;
} {
  const normalized: Record<string, number> = {};
  let usedLegacyKeys = false;

  if (value && typeof value === "object") {
    for (const [rawKey, rawValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const canonical = KEY_ALIASES[rawKey];
      if (!canonical) continue;
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;
      normalized[canonical] = rawValue;
      if (rawKey !== canonical) usedLegacyKeys = true;
    }
  }

  // Fall back entirely to defaults if the input is incomplete (any known key
  // missing) or if legacy uppercase keys were observed. This means partial or
  // legacy-shaped inputs are replaced wholesale rather than merged.
  const keysPresent = (
    Object.keys(DEFAULT_GACHA_RATES) as (keyof typeof DEFAULT_GACHA_RATES)[]
  ).every((k) => k in normalized);
  if (!keysPresent || usedLegacyKeys) {
    return { value: { ...DEFAULT_GACHA_RATES }, usedLegacyKeys };
  }

  return {
    value: normalized as RateRecord,
    usedLegacyKeys,
  };
}
