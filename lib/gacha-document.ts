import { z } from "zod";
import {
  gachaRatesSchema,
  readGachaRates,
  type GachaRates,
} from "@/lib/gacha-rates";

export const gachaRarities = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export type GachaRarity = (typeof gachaRarities)[number];

const gachaRaritySchema = z.enum(gachaRarities);

const publishedPoolEntrySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(180),
  productName: z.string().trim().min(1).max(120).nullable(),
  variantLabel: z.string().trim().min(1).max(120).nullable(),
  rarity: gachaRaritySchema,
  weight: z.number().int().min(1).max(1_000),
  featured: z.boolean(),
  sortOrder: z.number().int(),
});

const publishedBannerSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  copy: z.string().trim().min(1).max(240),
  type: z.enum(["CHARACTER", "WEAPON", "COLLECTION"]),
  theme: z.enum(["anemo", "ember", "starlight"]),
  featuredCount: z.number().int().min(1).max(10),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  sortOrder: z.number().int(),
  pool: z.array(publishedPoolEntrySchema).min(1),
});

export const publishedGachaDocumentSchema = z.object({
  version: z.literal(1),
  publishedAt: z.iso.datetime(),
  title: z.string().trim().min(1).max(80),
  introduction: z.string().trim().min(1).max(240),
  gameTheme: z.enum(["anemo", "ember", "starlight"]),
  pityEnabled: z.boolean(),
  guaranteedAt: z.number().int().min(1).max(500),
  guaranteedRarity: gachaRaritySchema,
  rates: gachaRatesSchema,
  banners: z.array(publishedBannerSchema).min(1),
  resultContract: z.literal("DIGITAL_REVEAL_ONLY"),
});

export type PublishedGachaDocument = z.infer<
  typeof publishedGachaDocumentSchema
>;
export type PublishedGachaBanner = PublishedGachaDocument["banners"][number];
export type PublishedGachaPoolEntry = PublishedGachaBanner["pool"][number];

type DraftConfig = {
  enabled: boolean;
  title: string;
  introduction: string;
  gameTheme: string;
  pityEnabled: boolean;
  guaranteedAt: number;
  guaranteedRarity: GachaRarity;
  rates: unknown;
};

type DraftBanner = {
  id: string;
  title: string;
  copy: string;
  type: "CHARACTER" | "WEAPON" | "COLLECTION";
  theme: string;
  featuredCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  sortOrder: number;
  pool: Array<{
    id: string;
    displayName: string;
    rarity: GachaRarity;
    weight: number;
    featured: boolean;
    sortOrder: number;
    productVariant?: {
      label: string;
      product: { name: string };
    } | null;
  }>;
};

export type GachaCompilationResult =
  | { success: true; document: PublishedGachaDocument; errors: [] }
  | { success: false; document: null; errors: string[] };

const rarityRateKey: Record<GachaRarity, keyof GachaRates> = {
  COMMON: "common",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
};

const rarityRank: Record<GachaRarity, number> = {
  COMMON: 0,
  RARE: 1,
  EPIC: 2,
  LEGENDARY: 3,
};

export function compileGachaDocument({
  config,
  banners,
  publishedAt = new Date(),
}: {
  config: DraftConfig | null;
  banners: DraftBanner[];
  publishedAt?: Date;
}): GachaCompilationResult {
  const errors: string[] = [];
  if (!config) {
    return {
      success: false,
      document: null,
      errors: ["Save the game setup before publishing."],
    };
  }
  if (!config.enabled) {
    errors.push("Enable the free game in Game setup before publishing.");
  }

  const ratesResult = readGachaRates(config.rates);
  const rates = ratesResult.value;
  if (ratesResult.usedDefaults) {
    errors.push("Save a complete odds table whose four tiers total 100%.");
  }

  const activeBanners = banners.filter((banner) => banner.active);
  if (!activeBanners.length) {
    errors.push("Include at least one reward banner in the published game.");
  }

  for (const banner of activeBanners) {
    if (!banner.pool.length) {
      errors.push(`${banner.title} needs at least one reveal in its lineup.`);
      continue;
    }
    if (
      (banner.startsAt && !banner.endsAt) ||
      (!banner.startsAt && banner.endsAt)
    ) {
      errors.push(
        `${banner.title} needs both a start and end date, or neither.`,
      );
    } else if (
      banner.startsAt &&
      banner.endsAt &&
      banner.startsAt >= banner.endsAt
    ) {
      errors.push(`${banner.title} must end after it starts.`);
    }

    for (const rarity of gachaRarities) {
      if (
        rates[rarityRateKey[rarity]] > 0 &&
        !banner.pool.some((entry) => entry.rarity === rarity)
      ) {
        errors.push(
          `${banner.title} needs a ${rarity.toLocaleLowerCase()} reveal because that tier has non-zero odds.`,
        );
      }
    }

    if (
      config.pityEnabled &&
      !banner.pool.some(
        (entry) =>
          rarityRank[entry.rarity] >= rarityRank[config.guaranteedRarity] &&
          rates[rarityRateKey[entry.rarity]] > 0,
      )
    ) {
      errors.push(
        `${banner.title} needs an eligible ${config.guaranteedRarity.toLocaleLowerCase()}-or-better reveal for the guarantee.`,
      );
    }
  }

  const candidate = {
    version: 1 as const,
    publishedAt: publishedAt.toISOString(),
    title: config.title,
    introduction: config.introduction,
    gameTheme: config.gameTheme,
    pityEnabled: config.pityEnabled,
    guaranteedAt: config.guaranteedAt,
    guaranteedRarity: config.guaranteedRarity,
    rates,
    banners: activeBanners.map((banner) => ({
      id: banner.id,
      title: banner.title,
      copy: banner.copy,
      type: banner.type,
      theme: banner.theme,
      featuredCount: banner.featuredCount,
      startsAt: banner.startsAt?.toISOString() ?? null,
      endsAt: banner.endsAt?.toISOString() ?? null,
      sortOrder: banner.sortOrder,
      pool: banner.pool.map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        productName: entry.productVariant?.product.name ?? null,
        variantLabel: entry.productVariant?.label ?? null,
        rarity: entry.rarity,
        weight: entry.weight,
        featured: entry.featured,
        sortOrder: entry.sortOrder,
      })),
    })),
    resultContract: "DIGITAL_REVEAL_ONLY" as const,
  };
  const parsed = publishedGachaDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    errors.push("Finish the required game copy, odds, and guarantee settings.");
  }

  return errors.length || !parsed.success
    ? { success: false, document: null, errors: [...new Set(errors)] }
    : { success: true, document: parsed.data, errors: [] };
}

export function readPublishedGachaDocument(
  value: unknown,
): PublishedGachaDocument | null {
  const parsed = publishedGachaDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function bannerAvailability(
  banner: PublishedGachaBanner,
  referenceTime = new Date(),
): "upcoming" | "live" | "ended" {
  if (banner.startsAt && referenceTime < new Date(banner.startsAt)) {
    return "upcoming";
  }
  if (banner.endsAt && referenceTime >= new Date(banner.endsAt)) {
    return "ended";
  }
  return "live";
}
