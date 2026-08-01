import {
  storefrontDocumentSchema,
  type StorefrontDocument,
} from "@/lib/storefront-document";

export const DEMO_BOOTH_SLUG = "cyfurden-demo";
export const DEMO_BOOTH_PATH = `/s/${DEMO_BOOTH_SLUG}`;

export const DEMO_BOOTH_ID = "cyfurden-demo-booth-v1";
export const DEMO_OWNER_ID = "cyfurden-demo-owner-v1";
export const DEMO_OWNER_EMAIL = "demo@cyfurden.invalid";

const reservedBoothSlugs = new Set([DEMO_BOOTH_SLUG]);

export function demoBilingual(english: string, vietnamese: string) {
  return `[en]${english}[/en][vi]${vietnamese}[/vi]`;
}

export function createDemoStorefrontDocument(
  featuredProductIds: string[],
): StorefrontDocument {
  return storefrontDocumentSchema.parse({
    name: demoBilingual("Paper Comet Studio", "Studio Sao Chổi Giấy"),
    tagline: demoBilingual(
      "Small paper worlds for bright convention tables.",
      "Những thế giới giấy nhỏ cho bàn hội chợ rực rỡ.",
    ),
    introduction: demoBilingual(
      "Meet field-note zines, tiny familiars, and weather stickers made for pockets, journals, and convention-day keepsakes.",
      "Khám phá zine ghi chép, linh vật tí hon và sticker thời tiết dành cho túi áo, sổ tay và kỷ niệm ngày hội chợ.",
    ),
    announcement: demoBilingual(
      "Demo booth · reservations are for testing only.",
      "Booth demo · đơn đặt trước chỉ dùng để thử nghiệm.",
    ),
    creatorName: "An Mai",
    creatorPronouns: demoBilingual("she / her", "cô ấy"),
    creatorLocation: demoBilingual(
      "Ho Chi Minh City, Vietnam",
      "Thành phố Hồ Chí Minh, Việt Nam",
    ),
    creatorBio: demoBilingual(
      "An draws pocket-sized field guides to imaginary weather and friendly night creatures.",
      "An vẽ những cẩm nang bỏ túi về thời tiết tưởng tượng và các sinh vật đêm thân thiện.",
    ),
    eventName: demoBilingual(
      "Cyfurden Preview Weekend",
      "Cuối tuần xem thử Cyfurden",
    ),
    eventVenue: demoBilingual("Online demo", "Bản demo trực tuyến"),
    eventBoothLabel: demoBilingual("Table D-13", "Bàn D-13"),
    eventHours: demoBilingual(
      "Always open for browsing",
      "Luôn mở để tham quan",
    ),
    eventStatusLabel: demoBilingual("Demo open", "Demo đang mở"),
    eventFulfillment: demoBilingual(
      "This maintained showcase does not fulfil or ship products.",
      "Booth giới thiệu này không giao hoặc vận chuyển sản phẩm.",
    ),
    locale: "en",
    themePreset: "meadow",
    accentColor: "#2f7d64",
    cornerRadius: "round",
    sectionOrder: ["featured", "booth-info", "browse", "catalogue", "cart"],
    visibleSections: ["featured", "booth-info", "browse", "catalogue", "cart"],
    featuredProductIds,
  });
}

export function isReservedBoothSlug(value: string) {
  return reservedBoothSlugs.has(value.trim().toLowerCase());
}
