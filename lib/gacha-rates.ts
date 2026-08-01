import { z } from "zod";

export const DEFAULT_GACHA_RATES = Object.freeze({
  common: 70,
  rare: 24,
  epic: 5,
  legendary: 1,
});

export type GachaRates = Record<keyof typeof DEFAULT_GACHA_RATES, number>;

export const gachaRatesSchema = z
  .object({
    common: z.number().int().min(0).max(100),
    rare: z.number().int().min(0).max(100),
    epic: z.number().int().min(0).max(100),
    legendary: z.number().int().min(0).max(100),
  })
  .refine(
    (rates) => rates.common + rates.rare + rates.epic + rates.legendary === 100,
    { message: "Gacha rates must total 100%." },
  );

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
  value: GachaRates;
  usedLegacyKeys: boolean;
  usedDefaults: boolean;
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
  const parsed = keysPresent
    ? gachaRatesSchema.safeParse(normalized)
    : { success: false as const };
  if (!parsed.success || usedLegacyKeys) {
    return {
      value: { ...DEFAULT_GACHA_RATES },
      usedLegacyKeys,
      usedDefaults: true,
    };
  }

  return {
    value: parsed.data,
    usedLegacyKeys,
    usedDefaults: false,
  };
}

export function parseGachaRatesInput(values: {
  common: unknown;
  rare: unknown;
  epic: unknown;
  legendary: unknown;
}): GachaRates {
  return gachaRatesSchema.parse({
    common: Number(values.common),
    rare: Number(values.rare),
    epic: Number(values.epic),
    legendary: Number(values.legendary),
  });
}
