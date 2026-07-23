import { z } from "zod";

export const socialPlatforms = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
  { id: "threads", label: "Threads" },
  { id: "youtube", label: "YouTube" },
] as const;

export type SocialPlatformId = (typeof socialPlatforms)[number]["id"];

const secureSocialUrl = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a complete HTTPS URL or leave this social link blank.");

export const boothSocialLinksSchema = z.object(
  Object.fromEntries(
    socialPlatforms.map((platform) => [platform.id, secureSocialUrl]),
  ) as Record<SocialPlatformId, typeof secureSocialUrl>,
);

export type BoothSocialLinks = z.infer<typeof boothSocialLinksSchema>;

export const emptyBoothSocialLinks = (): BoothSocialLinks => ({
  instagram: "",
  facebook: "",
  tiktok: "",
  x: "",
  threads: "",
  youtube: "",
});

export function readBoothSocialLinks(value: unknown): BoothSocialLinks {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...emptyBoothSocialLinks(), ...(value as Record<string, unknown>) }
      : emptyBoothSocialLinks();
  const result = boothSocialLinksSchema.safeParse(candidate);
  return result.success ? result.data : emptyBoothSocialLinks();
}

export function compactBoothSocialLinks(links: BoothSocialLinks) {
  return Object.fromEntries(
    socialPlatforms.flatMap(({ id }) => (links[id] ? [[id, links[id]]] : [])),
  );
}

export function isBoothLogoObjectKey(boothId: string, objectKey: string) {
  const escapedBoothId = boothId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^booths/${escapedBoothId}/identity/logo-[a-f0-9-]+\\.(?:png|jpe?g|webp)$`,
    "i",
  ).test(objectKey);
}
