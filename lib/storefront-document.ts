import { z } from "zod";
import { defaultStorefrontContent } from "@/lib/system-content";

export const storefrontSectionIds = [
  "featured",
  "booth-info",
  "browse",
  "catalogue",
  "cart",
] as const;

export const storefrontCornerRadiusPixels = {
  soft: 10,
  round: 16,
  pill: 24,
} as const;

export const storefrontLocaleDisplayCodes = {
  en: "EN",
  vi: "VN",
} as const;

export const storefrontFeaturedProductLimit = 5;

export const storefrontDocumentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(2).max(140),
  introduction: z.string().trim().min(10).max(800),
  announcement: z.string().trim().max(180),
  creatorName: z.string().trim().min(2).max(80),
  creatorPronouns: z.string().trim().max(40),
  creatorLocation: z.string().trim().max(120),
  creatorBio: z.string().trim().max(500),
  eventName: z.string().trim().max(120),
  eventVenue: z.string().trim().max(120),
  eventBoothLabel: z.string().trim().max(80),
  eventHours: z.string().trim().max(120),
  eventStatusLabel: z.string().trim().max(60),
  eventFulfillment: z.string().trim().max(240),
  locale: z.enum(["en", "vi"]),
  themePreset: z.enum(["lantern", "meadow", "midnight"]),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i),
  cornerRadius: z.enum(["soft", "round", "pill"]),
  sectionOrder: z
    .array(z.enum(storefrontSectionIds))
    .length(storefrontSectionIds.length)
    .refine(
      (sections) => new Set(sections).size === storefrontSectionIds.length,
      "Section order must contain every storefront section exactly once.",
    ),
  visibleSections: z.array(z.enum(storefrontSectionIds)).min(3),
  featuredProductIds: z
    .array(z.string().trim().min(1).max(64))
    .max(storefrontFeaturedProductLimit)
    .refine(
      (productIds) => new Set(productIds).size === productIds.length,
      "Featured products must be unique.",
    )
    .nullable()
    .default(null),
});

export type StorefrontDocument = z.infer<typeof storefrontDocumentSchema>;

export function createDefaultStorefrontDocument(
  name: string,
): StorefrontDocument {
  return {
    name,
    tagline: defaultStorefrontContent.tagline,
    introduction: defaultStorefrontContent.introduction,
    announcement: defaultStorefrontContent.announcement,
    creatorName: name,
    creatorPronouns: "",
    creatorLocation: defaultStorefrontContent.creatorLocation,
    creatorBio: defaultStorefrontContent.creatorBio,
    eventName: defaultStorefrontContent.eventName,
    eventVenue: defaultStorefrontContent.eventVenue,
    eventBoothLabel: defaultStorefrontContent.eventBoothLabel,
    eventHours: defaultStorefrontContent.eventHours,
    eventStatusLabel: defaultStorefrontContent.eventStatusLabel,
    eventFulfillment: defaultStorefrontContent.eventFulfillment,
    locale: "en",
    themePreset: "lantern",
    accentColor: "#d45a61",
    cornerRadius: "round",
    sectionOrder: [...storefrontSectionIds],
    visibleSections: [...storefrontSectionIds],
    featuredProductIds: null,
  };
}

export function readStorefrontDocument(
  value: unknown,
  fallbackName: string,
): StorefrontDocument {
  const result = storefrontDocumentSchema.safeParse(value);
  return result.success
    ? result.data
    : createDefaultStorefrontDocument(fallbackName);
}

export function resolveStorefrontFeaturedProductIds(
  document: StorefrontDocument,
  products: ReadonlyArray<{ id: string; featured: boolean }>,
) {
  const availableProductIds = new Set(products.map((product) => product.id));
  const requestedProductIds =
    document.featuredProductIds ??
    products.filter((product) => product.featured).map((product) => product.id);

  return requestedProductIds
    .filter(
      (productId, index) =>
        availableProductIds.has(productId) &&
        requestedProductIds.indexOf(productId) === index,
    )
    .slice(0, storefrontFeaturedProductLimit);
}
