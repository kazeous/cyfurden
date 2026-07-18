import { z } from "zod";

export const storefrontSectionIds = [
  "featured",
  "booth-info",
  "browse",
  "catalogue",
  "cart",
] as const;

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
  sectionOrder: z.array(z.enum(storefrontSectionIds)).length(5),
  visibleSections: z.array(z.enum(storefrontSectionIds)).min(3),
});

export type StorefrontDocument = z.infer<typeof storefrontDocumentSchema>;

export function createDefaultStorefrontDocument(
  name: string,
): StorefrontDocument {
  return {
    name,
    tagline: "Small wonders, gathered with care.",
    introduction:
      "Welcome to our pocket-sized convention booth. Browse the latest pieces and save your favourites for pickup.",
    announcement: "Pre-orders are open for the next convention weekend.",
    creatorName: name,
    creatorPronouns: "",
    creatorLocation: "Online and at selected conventions",
    creatorBio:
      "An independent artist making cheerful objects for everyday rituals.",
    eventName: "Next convention",
    eventVenue: "Details coming soon",
    eventBoothLabel: "Booth TBA",
    eventHours: "Hours to be announced",
    eventStatusLabel: "Pre-orders open",
    eventFulfillment: "Convention pickup and pre-order delivery details vary.",
    locale: "en",
    themePreset: "lantern",
    accentColor: "#d45a61",
    cornerRadius: "round",
    sectionOrder: [...storefrontSectionIds],
    visibleSections: [...storefrontSectionIds],
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
