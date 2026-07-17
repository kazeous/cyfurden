import type { OracleImageAsset } from "./oracle-images";

export type CategoryId = "prints" | "pins" | "paper-goods" | "charms";

export type AvailabilityStatus =
  | "available"
  | "low-stock"
  | "preorder"
  | "sold-out";

export interface Availability {
  status: AvailabilityStatus;
  label: string;
  purchasable: boolean;
  quantityRemaining?: number;
  fulfillmentNote: string;
}

export interface ProductOptionValue {
  id: string;
  label: string;
}

export interface ProductOptionGroup {
  id: string;
  label: string;
  values: readonly ProductOptionValue[];
}

export interface ProductVariant {
  id: string;
  sku: string;
  label: string;
  selectedOptions: Readonly<Record<string, string>>;
  priceCents?: number;
  availability: Availability;
}

export interface Product {
  id: string;
  slug: string;
  categoryId: CategoryId;
  name: string;
  eyebrow: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  currency: "VND";
  featured: boolean;
  images: readonly OracleImageAsset[];
  optionGroups: readonly ProductOptionGroup[];
  variants: readonly ProductVariant[];
  tags: readonly string[];
}

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
}

export interface SocialLink {
  platform: "instagram" | "bluesky" | "email";
  label: string;
  href: string;
}

export interface BoothConfig {
  slug: string;
  name: string;
  tagline: string;
  introduction: string;
  announcement: string;
  heroImage: OracleImageAsset;
  creator: {
    name: string;
    pronouns: string;
    location: string;
    bio: string;
    avatar: OracleImageAsset;
    socials: readonly SocialLink[];
  };
  event: {
    name: string;
    venue: string;
    boothLabel: string;
    startsAt: string;
    endsAt: string;
    displayHours: string;
    statusLabel: string;
    fulfillment: string;
  };
  payment: {
    method: "manual-bank-transfer";
    isDemo: boolean;
    bankName: string;
    accountName: string;
    accountNumber: string;
    qrImage: OracleImageAsset;
    transferReferenceTemplate: string;
    instructions: string;
    disclaimer: string;
  };
  categories: readonly Category[];
  products: readonly Product[];
}

export type Booth = BoothConfig;

const available = (fulfillmentNote: string): Availability => ({
  status: "available",
  label: "Available",
  purchasable: true,
  fulfillmentNote,
});

const lowStock = (
  quantityRemaining: number,
  fulfillmentNote: string,
): Availability => ({
  status: "low-stock",
  label: `Only ${quantityRemaining} left`,
  purchasable: true,
  quantityRemaining,
  fulfillmentNote,
});

const preorder = (fulfillmentNote: string): Availability => ({
  status: "preorder",
  label: "Pre-order",
  purchasable: true,
  fulfillmentNote,
});

const soldOut = (fulfillmentNote: string): Availability => ({
  status: "sold-out",
  label: "Sold out",
  purchasable: false,
  quantityRemaining: 0,
  fulfillmentNote,
});

const eventPickup = "Ready for pickup at the event booth.";
const preorderDelivery = "Ships within 3–4 weeks after the event.";

export const categories = [
  {
    id: "prints",
    label: "Art prints",
    description: "Small-batch illustrations on archival paper.",
  },
  {
    id: "pins",
    label: "Enamel pins",
    description: "Wearable keepsakes with warm metal details.",
  },
  {
    id: "paper-goods",
    label: "Paper goods",
    description: "Stickers, postcards, and desk-sized delights.",
  },
  {
    id: "charms",
    label: "Charms",
    description: "Double-sided acrylic companions for bags and keys.",
  },
] as const satisfies readonly Category[];

export const products = [
  {
    id: "midnight-garden-riso",
    slug: "midnight-garden-riso",
    categoryId: "prints",
    name: "Midnight Garden Riso Print",
    eyebrow: "Two-colour risograph",
    shortDescription:
      "Moonlit moths drift through an overgrown balcony garden.",
    description:
      "A textured indigo-and-coral risograph inspired by quiet city gardens after rain. Each print has the gentle colour variation that makes the process unique.",
    priceCents: 32000000,
    currency: "VND",
    featured: true,
    images: [
      {
        objectKey:
          "booths/lantern-and-loom/products/midnight-garden/front.webp",
        alt: "Midnight Garden risograph with moths and balcony plants",
        width: 1200,
        height: 1500,
      },
      {
        objectKey:
          "booths/lantern-and-loom/products/midnight-garden/detail.webp",
        alt: "Close view of the risograph ink texture",
        width: 1200,
        height: 1500,
      },
    ],
    optionGroups: [
      {
        id: "size",
        label: "Size",
        values: [
          { id: "a5", label: "A5" },
          { id: "a4", label: "A4" },
        ],
      },
    ],
    variants: [
      {
        id: "midnight-garden-a5",
        sku: "LL-MGR-A5",
        label: "A5",
        selectedOptions: { size: "a5" },
        availability: available(eventPickup),
      },
      {
        id: "midnight-garden-a4",
        sku: "LL-MGR-A4",
        label: "A4",
        selectedOptions: { size: "a4" },
        priceCents: 48000000,
        availability: lowStock(4, eventPickup),
      },
    ],
    tags: ["moths", "botanical", "risograph"],
  },
  {
    id: "cloud-library-print",
    slug: "cloud-library-print",
    categoryId: "prints",
    name: "Cloud Library Print",
    eyebrow: "Archival pigment print",
    shortDescription:
      "A tiny skybound library where weather is carefully catalogued.",
    description:
      "Soft layers of blue, cream, and persimmon turn an impossible library into a gentle reading nook. Printed locally on lightly textured archival stock.",
    priceCents: 42000000,
    currency: "VND",
    featured: false,
    images: [
      {
        objectKey: "booths/lantern-and-loom/products/cloud-library/front.webp",
        alt: "Whimsical library floating among clouds",
        width: 1200,
        height: 1500,
      },
    ],
    optionGroups: [],
    variants: [
      {
        id: "cloud-library-standard",
        sku: "LL-CLP-A4",
        label: "A4 print",
        selectedOptions: {},
        availability: preorder(preorderDelivery),
      },
    ],
    tags: ["books", "clouds", "cozy"],
  },
  {
    id: "lantern-moth-pin",
    slug: "lantern-moth-pin",
    categoryId: "pins",
    name: "Lantern Moth Pin",
    eyebrow: "Hard enamel pin",
    shortDescription: "A jewel-toned moth carrying its own pocket-sized glow.",
    description:
      "Gold-plated hard enamel with two pin posts for a steady fit. Choose a moss-green or berry-red wing palette.",
    priceCents: 22000000,
    currency: "VND",
    featured: true,
    images: [
      {
        objectKey: "booths/lantern-and-loom/products/lantern-moth/pair.webp",
        alt: "Green and red Lantern Moth enamel pins",
        width: 1400,
        height: 1200,
      },
    ],
    optionGroups: [
      {
        id: "colour",
        label: "Colour",
        values: [
          { id: "moss", label: "Moss" },
          { id: "berry", label: "Berry" },
        ],
      },
    ],
    variants: [
      {
        id: "lantern-moth-moss",
        sku: "LL-LMP-MOS",
        label: "Moss",
        selectedOptions: { colour: "moss" },
        availability: available(eventPickup),
      },
      {
        id: "lantern-moth-berry",
        sku: "LL-LMP-BER",
        label: "Berry",
        selectedOptions: { colour: "berry" },
        availability: soldOut("This colour may return in a future batch."),
      },
    ],
    tags: ["moth", "enamel", "wearable"],
  },
  {
    id: "sleepy-comet-pin",
    slug: "sleepy-comet-pin",
    categoryId: "pins",
    name: "Sleepy Comet Pin",
    eyebrow: "Glitter enamel pin",
    shortDescription:
      "A drowsy comet crossing the night in no particular hurry.",
    description:
      "A small silver-plated pin with translucent glitter in its tail and a soft rubber clutch.",
    priceCents: 19000000,
    currency: "VND",
    featured: false,
    images: [
      {
        objectKey: "booths/lantern-and-loom/products/sleepy-comet/front.webp",
        alt: "Silver and blue Sleepy Comet enamel pin",
        width: 1200,
        height: 1200,
      },
    ],
    optionGroups: [],
    variants: [
      {
        id: "sleepy-comet-standard",
        sku: "LL-SCP-STD",
        label: "Standard",
        selectedOptions: {},
        availability: lowStock(3, eventPickup),
      },
    ],
    tags: ["space", "glitter", "enamel"],
  },
  {
    id: "tiny-night-market-stickers",
    slug: "tiny-night-market-stickers",
    categoryId: "paper-goods",
    name: "Tiny Night Market Sticker Sheet",
    eyebrow: "Weatherproof vinyl",
    shortDescription:
      "Lanterns, snacks, flowers, and friendly spirits for your journal.",
    description:
      "One A6 sheet of ten kiss-cut vinyl stickers with a soft matte finish. Durable enough for notebooks, bottles, and travel cases.",
    priceCents: 9500000,
    currency: "VND",
    featured: true,
    images: [
      {
        objectKey:
          "booths/lantern-and-loom/products/night-market-stickers/sheet.webp",
        alt: "Sticker sheet of tiny night market objects and spirits",
        width: 1200,
        height: 1500,
      },
    ],
    optionGroups: [],
    variants: [
      {
        id: "tiny-night-market-sheet",
        sku: "LL-TNM-A6",
        label: "A6 sheet",
        selectedOptions: {},
        availability: available(eventPickup),
      },
    ],
    tags: ["stickers", "journaling", "night market"],
  },
  {
    id: "rainy-day-postcard-set",
    slug: "rainy-day-postcard-set",
    categoryId: "paper-goods",
    name: "Rainy Day Postcard Set",
    eyebrow: "Set of four",
    shortDescription:
      "Four small scenes celebrating puddles, tea, and window light.",
    description:
      "Four illustrated A6 postcards printed on an uncoated stock that is easy to write on. Packed in a recyclable glassine envelope.",
    priceCents: 14000000,
    currency: "VND",
    featured: false,
    images: [
      {
        objectKey: "booths/lantern-and-loom/products/rainy-postcards/set.webp",
        alt: "Four illustrated rainy day postcards fanned on a table",
        width: 1400,
        height: 1200,
      },
    ],
    optionGroups: [],
    variants: [
      {
        id: "rainy-day-set",
        sku: "LL-RDP-SET",
        label: "Set of four",
        selectedOptions: {},
        availability: available(eventPickup),
      },
    ],
    tags: ["postcards", "rain", "stationery"],
  },
  {
    id: "tram-cat-charm",
    slug: "tram-cat-charm",
    categoryId: "charms",
    name: "Last Tram Cat Charm",
    eyebrow: "Double-sided acrylic",
    shortDescription:
      "A patient cat waiting beneath the last glowing tram sign.",
    description:
      "A 55 mm charm with different artwork on each side, a star-shaped clasp, and a clear protective finish.",
    priceCents: 18000000,
    currency: "VND",
    featured: true,
    images: [
      {
        objectKey: "booths/lantern-and-loom/products/tram-cat/front.webp",
        alt: "Last Tram Cat acrylic charm with a gold star clasp",
        width: 1200,
        height: 1400,
      },
      {
        objectKey: "booths/lantern-and-loom/products/tram-cat/back.webp",
        alt: "Reverse side of the Last Tram Cat charm",
        width: 1200,
        height: 1400,
      },
    ],
    optionGroups: [
      {
        id: "clasp",
        label: "Clasp",
        values: [
          { id: "gold-star", label: "Gold star" },
          { id: "silver-moon", label: "Silver moon" },
        ],
      },
    ],
    variants: [
      {
        id: "tram-cat-gold-star",
        sku: "LL-TCC-GLD",
        label: "Gold star clasp",
        selectedOptions: { clasp: "gold-star" },
        availability: available(eventPickup),
      },
      {
        id: "tram-cat-silver-moon",
        sku: "LL-TCC-SLV",
        label: "Silver moon clasp",
        selectedOptions: { clasp: "silver-moon" },
        availability: preorder(preorderDelivery),
      },
    ],
    tags: ["cat", "tram", "acrylic"],
  },
  {
    id: "pocket-familiar-charm",
    slug: "pocket-familiar-charm",
    categoryId: "charms",
    name: "Pocket Familiar Charm",
    eyebrow: "Shaker acrylic charm",
    shortDescription: "A tiny spellbook with a curious familiar tucked inside.",
    description:
      "A playful 60 mm shaker charm with three miniature moving pieces and a lavender heart clasp.",
    priceCents: 24000000,
    currency: "VND",
    featured: false,
    images: [
      {
        objectKey:
          "booths/lantern-and-loom/products/pocket-familiar/front.webp",
        alt: "Spellbook-shaped shaker charm with tiny familiar pieces",
        width: 1200,
        height: 1400,
      },
    ],
    optionGroups: [],
    variants: [
      {
        id: "pocket-familiar-standard",
        sku: "LL-PFC-STD",
        label: "Standard",
        selectedOptions: {},
        availability: soldOut("This first edition is no longer available."),
      },
    ],
    tags: ["magic", "shaker", "acrylic"],
  },
] as const satisfies readonly Product[];

export const booth = {
  slug: "lantern-and-loom",
  name: "Lantern & Loom",
  tagline: "Small wonders for slow evenings.",
  introduction:
    "Illustrated paper goods and pocket-sized companions woven from rainy streets, warm windows, and a little night-sky magic.",
  announcement:
    "Pre-orders placed this weekend include a tiny mystery sticker.",
  heroImage: {
    objectKey: "booths/lantern-and-loom/booth/hero.webp",
    alt: "A warmly lit artist table filled with prints, pins, and paper goods",
    width: 1920,
    height: 1080,
  },
  creator: {
    name: "Mina Tran",
    pronouns: "she/they",
    location: "Ho Chi Minh City, Vietnam",
    bio: "Mina makes gentle illustrations about city nights, overlooked creatures, and places that feel like home.",
    avatar: {
      objectKey: "booths/lantern-and-loom/creator/mina-avatar.webp",
      alt: "Illustrated portrait of Mina wearing a rust-coloured beret",
      width: 600,
      height: 600,
    },
    socials: [
      {
        platform: "instagram",
        label: "@lanternandloom",
        href: "https://www.instagram.com/lanternandloom.demo",
      },
      {
        platform: "bluesky",
        label: "@lanternandloom.demo",
        href: "https://bsky.app/profile/lanternandloom.demo",
      },
      {
        platform: "email",
        label: "hello@lanternandloom.example",
        href: "mailto:hello@lanternandloom.example",
      },
    ],
  },
  event: {
    name: "Moonrise Makers Market",
    venue: "Riverside Creative Hall",
    boothLabel: "Hall B · Table 27",
    startsAt: "2026-10-18T10:00:00+07:00",
    endsAt: "2026-10-19T18:00:00+07:00",
    displayHours: "18–19 October · 10:00–18:00",
    statusLabel: "Pre-orders open",
    fulfillment:
      "Choose event pickup or the listed post-event delivery window.",
  },
  payment: {
    method: "manual-bank-transfer",
    isDemo: true,
    bankName: "Demo Cooperative Bank",
    accountName: "LANTERN AND LOOM STUDIO",
    accountNumber: "0000 1234 5678",
    qrImage: {
      objectKey: "booths/lantern-and-loom/payment/demo-bank-qr.png",
      alt: "Demo bank-transfer QR code for Lantern and Loom",
      width: 900,
      height: 900,
    },
    transferReferenceTemplate: "CYF-{order-code}",
    instructions:
      "Transfer the exact cart total and include the displayed order reference. Keep your bank receipt and contact the creator if you need help.",
    disclaimer:
      "This booth does not process or verify payments automatically. The creator confirms transfers manually.",
  },
  categories,
  products,
} as const satisfies BoothConfig;
