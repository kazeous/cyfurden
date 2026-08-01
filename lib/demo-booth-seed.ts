import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  createDemoStorefrontDocument,
  demoBilingual,
  DEMO_BOOTH_ID,
  DEMO_BOOTH_PATH,
  DEMO_BOOTH_SLUG,
  DEMO_OWNER_EMAIL,
  DEMO_OWNER_ID,
} from "@/lib/demo-booth";
import { compileGachaDocument } from "@/lib/gacha-document";
import { DEFAULT_GACHA_RATES } from "@/lib/gacha-rates";

const DEMO_PUBLISHED_AT = new Date("2026-08-01T00:00:00.000Z");
const DEMO_PROMOTION_ID = "cyfurden-demo-promotion-v1";
const DEMO_GACHA_BANNER_ID = "cyfurden-demo-gacha-banner-v1";
const gachaWeights = {
  COMMON: 70,
  RARE: 20,
  EPIC: 8,
  LEGENDARY: 2,
} as const;

const categorySpecs = [
  {
    key: "paper",
    slug: "paper-goods",
    name: demoBilingual("Paper goods", "Đồ giấy"),
    description: demoBilingual(
      "Field notes and small printed stories.",
      "Ghi chép thực địa và truyện in khổ nhỏ.",
    ),
    sortOrder: 0,
  },
  {
    key: "pocket",
    slug: "pocket-friends",
    name: demoBilingual("Pocket friends", "Bạn nhỏ bỏ túi"),
    description: demoBilingual(
      "Pins and stickers for everyday companions.",
      "Pin và sticker làm bạn đồng hành mỗi ngày.",
    ),
    sortOrder: 1,
  },
] as const;

const productSpecs = [
  {
    key: "field-notes",
    categoryKey: "paper",
    slug: "tidepool-field-notes",
    sku: "DEMO-FIELD-NOTES",
    name: demoBilingual("Tidepool Field Notes", "Sổ Ghi Chép Vũng Triều"),
    eyebrow: demoBilingual("A6 zine · 28 pages", "Zine A6 · 28 trang"),
    shortDescription: demoBilingual(
      "An illustrated guide to creatures that borrow the moonlight.",
      "Cẩm nang minh hoạ về những sinh vật mượn ánh trăng.",
    ),
    description: demoBilingual(
      "A hand-bound pocket zine with quiet observations, creature sketches, and a fold-out tide chart.",
      "Zine bỏ túi đóng tay gồm ghi chép nhẹ nhàng, phác thảo sinh vật và bản đồ thủy triều gấp mở.",
    ),
    priceCents: BigInt(12_000_000),
    featured: true,
    tags: ["zine", "paper", "demo"],
    sortOrder: 0,
    variants: [
      {
        sku: "DEMO-FIELD-NOTES-STANDARD",
        label: demoBilingual("Standard edition", "Bản tiêu chuẩn"),
        sortOrder: 0,
        rarity: "COMMON" as const,
        displayName: demoBilingual("Moon Borrower", "Kẻ Mượn Trăng"),
      },
    ],
  },
  {
    key: "familiar-pin",
    categoryKey: "pocket",
    slug: "night-market-familiar-pin",
    sku: "DEMO-FAMILIAR-PIN",
    name: demoBilingual("Night Market Familiar Pin", "Pin Linh Vật Chợ Đêm"),
    eyebrow: demoBilingual("Hard enamel pin", "Pin men cứng"),
    shortDescription: demoBilingual(
      "A tiny companion with a paper-star tail.",
      "Một người bạn tí hon có chiếc đuôi ngôi sao giấy.",
    ),
    description: demoBilingual(
      "A 30 mm hard-enamel familiar pin with two colourways and a locking back.",
      "Pin linh vật men cứng 30 mm với hai phối màu và chốt khoá chắc chắn.",
    ),
    priceCents: BigInt(18_000_000),
    featured: true,
    tags: ["pin", "enamel", "demo"],
    sortOrder: 1,
    variants: [
      {
        sku: "DEMO-FAMILIAR-FOG",
        label: demoBilingual("Fog blue", "Xanh sương"),
        sortOrder: 0,
        rarity: "RARE" as const,
        displayName: demoBilingual("Fog Familiar", "Linh Vật Sương"),
      },
      {
        sku: "DEMO-FAMILIAR-CORAL",
        label: demoBilingual("Coral red", "Đỏ san hô"),
        sortOrder: 1,
        rarity: "EPIC" as const,
        displayName: demoBilingual("Coral Familiar", "Linh Vật San Hô"),
      },
    ],
  },
  {
    key: "weather-stickers",
    categoryKey: "pocket",
    slug: "tiny-weather-sticker-sheet",
    sku: "DEMO-WEATHER-STICKERS",
    name: demoBilingual(
      "Tiny Weather Sticker Sheet",
      "Tờ Sticker Thời Tiết Tí Hon",
    ),
    eyebrow: demoBilingual("Kiss-cut sticker sheet", "Tờ sticker cắt rời"),
    shortDescription: demoBilingual(
      "Twelve forecasts for journals and letters.",
      "Mười hai dự báo dành cho sổ tay và thư từ.",
    ),
    description: demoBilingual(
      "A matte vinyl sheet of pocket clouds, sun showers, and one very determined comet.",
      "Tờ vinyl mờ gồm mây bỏ túi, mưa nắng và một sao chổi cực kỳ quyết tâm.",
    ),
    priceCents: BigInt(4_500_000),
    featured: true,
    tags: ["sticker", "weather", "demo"],
    sortOrder: 2,
    variants: [
      {
        sku: "DEMO-WEATHER-STICKERS-STANDARD",
        label: demoBilingual("One sheet", "Một tờ"),
        sortOrder: 0,
        rarity: "LEGENDARY" as const,
        displayName: demoBilingual("Comet Forecast", "Dự Báo Sao Chổi"),
      },
    ],
  },
] as const;

function assertDemoIdentity({
  boothById,
  boothBySlug,
  ownerById,
  ownerByEmail,
}: {
  boothById: { id: string; slug: string; ownerId: string } | null;
  boothBySlug: { id: string; slug: string; ownerId: string } | null;
  ownerById: { id: string; email: string } | null;
  ownerByEmail: { id: string; email: string } | null;
}) {
  if (
    (boothById &&
      (boothById.slug !== DEMO_BOOTH_SLUG ||
        boothById.ownerId !== DEMO_OWNER_ID)) ||
    (boothBySlug &&
      (boothBySlug.id !== DEMO_BOOTH_ID ||
        boothBySlug.ownerId !== DEMO_OWNER_ID))
  ) {
    throw new Error(
      `Refusing to seed: ${DEMO_BOOTH_SLUG} is not owned by the reserved demo identity.`,
    );
  }

  if (
    (ownerById && ownerById.email !== DEMO_OWNER_EMAIL) ||
    (ownerByEmail && ownerByEmail.id !== DEMO_OWNER_ID)
  ) {
    throw new Error(
      `Refusing to seed: ${DEMO_OWNER_EMAIL} is not the reserved demo owner.`,
    );
  }
}

export async function seedDemoBooth() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (transaction) => {
          const boothById = await transaction.booth.findUnique({
            where: { id: DEMO_BOOTH_ID },
            select: { id: true, slug: true, ownerId: true },
          });
          const boothBySlug = await transaction.booth.findUnique({
            where: { slug: DEMO_BOOTH_SLUG },
            select: { id: true, slug: true, ownerId: true },
          });
          const ownerById = await transaction.user.findUnique({
            where: { id: DEMO_OWNER_ID },
            select: { id: true, email: true },
          });
          const ownerByEmail = await transaction.user.findUnique({
            where: { email: DEMO_OWNER_EMAIL },
            select: { id: true, email: true },
          });
          assertDemoIdentity({
            boothById,
            boothBySlug,
            ownerById,
            ownerByEmail,
          });

          await transaction.user.upsert({
            where: { id: DEMO_OWNER_ID },
            create: {
              id: DEMO_OWNER_ID,
              name: "Cyfurden Demo Curator",
              email: DEMO_OWNER_EMAIL,
              emailVerified: true,
            },
            update: {
              name: "Cyfurden Demo Curator",
              email: DEMO_OWNER_EMAIL,
              emailVerified: true,
            },
          });
          await transaction.booth.upsert({
            where: { id: DEMO_BOOTH_ID },
            create: {
              id: DEMO_BOOTH_ID,
              slug: DEMO_BOOTH_SLUG,
              name: "Paper Comet Studio",
              status: "PUBLISHED",
              locale: "en",
              currency: "VND",
              ownerId: DEMO_OWNER_ID,
            },
            update: {
              slug: DEMO_BOOTH_SLUG,
              name: "Paper Comet Studio",
              status: "PUBLISHED",
              locale: "en",
              currency: "VND",
              ownerId: DEMO_OWNER_ID,
            },
          });
          await transaction.boothMembership.upsert({
            where: {
              boothId_userId: {
                boothId: DEMO_BOOTH_ID,
                userId: DEMO_OWNER_ID,
              },
            },
            create: {
              boothId: DEMO_BOOTH_ID,
              userId: DEMO_OWNER_ID,
              role: "OWNER",
              status: "ACTIVE",
            },
            update: { role: "OWNER", status: "ACTIVE" },
          });

          const categories = new Map<string, string>();
          for (const category of categorySpecs) {
            const record = await transaction.category.upsert({
              where: {
                boothId_slug: {
                  boothId: DEMO_BOOTH_ID,
                  slug: category.slug,
                },
              },
              create: {
                boothId: DEMO_BOOTH_ID,
                slug: category.slug,
                name: category.name,
                description: category.description,
                sortOrder: category.sortOrder,
              },
              update: {
                name: category.name,
                description: category.description,
                sortOrder: category.sortOrder,
              },
              select: { id: true },
            });
            categories.set(category.key, record.id);
          }

          const products = new Map<string, string>();
          for (const product of productSpecs) {
            const categoryId = categories.get(product.categoryKey);
            if (!categoryId)
              throw new Error("Demo category seed is incomplete.");
            const record = await transaction.product.upsert({
              where: {
                boothId_slug: {
                  boothId: DEMO_BOOTH_ID,
                  slug: product.slug,
                },
              },
              create: {
                boothId: DEMO_BOOTH_ID,
                categoryId,
                slug: product.slug,
                sku: product.sku,
                name: product.name,
                eyebrow: product.eyebrow,
                shortDescription: product.shortDescription,
                description: product.description,
                priceCents: product.priceCents,
                status: "LIVE",
                featured: product.featured,
                tags: [...product.tags],
                sortOrder: product.sortOrder,
              },
              update: {
                categoryId,
                sku: product.sku,
                name: product.name,
                eyebrow: product.eyebrow,
                shortDescription: product.shortDescription,
                description: product.description,
                priceCents: product.priceCents,
                status: "LIVE",
                featured: product.featured,
                tags: [...product.tags],
                sortOrder: product.sortOrder,
              },
              select: { id: true },
            });
            products.set(product.key, record.id);

            for (const variant of product.variants) {
              await transaction.productVariant.upsert({
                where: {
                  productId_sku: { productId: record.id, sku: variant.sku },
                },
                create: {
                  productId: record.id,
                  sku: variant.sku,
                  label: variant.label,
                  status: "AVAILABLE",
                  stockQuantity: null,
                  fulfillmentNote: demoBilingual(
                    "Demo listing · no item will be fulfilled.",
                    "Sản phẩm demo · không có hàng được giao.",
                  ),
                  sortOrder: variant.sortOrder,
                },
                update: {
                  label: variant.label,
                  priceCents: null,
                  status: "AVAILABLE",
                  stockQuantity: null,
                  fulfillmentNote: demoBilingual(
                    "Demo listing · no item will be fulfilled.",
                    "Sản phẩm demo · không có hàng được giao.",
                  ),
                  sortOrder: variant.sortOrder,
                },
              });
            }
          }

          const featuredProductIds = productSpecs.map((product) => {
            const productId = products.get(product.key);
            if (!productId) throw new Error("Demo product seed is incomplete.");
            return productId;
          });
          const storefrontDocument =
            createDemoStorefrontDocument(featuredProductIds);
          await transaction.storefrontConfig.upsert({
            where: { boothId: DEMO_BOOTH_ID },
            create: {
              boothId: DEMO_BOOTH_ID,
              schemaVersion: 1,
              editVersion: 1,
              draftDocument: storefrontDocument,
              publishedDocument: storefrontDocument,
              publishedAt: DEMO_PUBLISHED_AT,
              updatedById: DEMO_OWNER_ID,
            },
            update: {
              schemaVersion: 1,
              editVersion: 1,
              draftDocument: storefrontDocument,
              publishedDocument: storefrontDocument,
              publishedAt: DEMO_PUBLISHED_AT,
              updatedById: DEMO_OWNER_ID,
            },
          });
          await transaction.boothPaymentInstruction.upsert({
            where: { boothId: DEMO_BOOTH_ID },
            create: {
              boothId: DEMO_BOOTH_ID,
              bankName: "Demo bank details — do not transfer",
              bankCode: "970436",
              accountName: "DEMO ONLY DO NOT TRANSFER",
              accountNumber: "0000000000",
              paymentLabel: demoBilingual(
                "Demo transfer — do not pay",
                "Chuyển khoản demo — không thanh toán",
              ),
              transferReferenceTemplate: "{code}",
              instructions: demoBilingual(
                "This checkout demonstrates Cyfurden's manual handoff. Do not send money; the account is synthetic and the reservation is not fulfilled.",
                "Checkout này minh hoạ quy trình thủ công của Cyfurden. Không chuyển tiền; tài khoản là giả lập và đơn sẽ không được giao.",
              ),
              disclaimer: demoBilingual(
                "Public demo only. No payment is requested or verified.",
                "Chỉ là demo công khai. Không yêu cầu hoặc xác minh thanh toán.",
              ),
            },
            update: {
              bankName: "Demo bank details — do not transfer",
              bankCode: "970436",
              accountName: "DEMO ONLY DO NOT TRANSFER",
              accountNumber: "0000000000",
              paymentLabel: demoBilingual(
                "Demo transfer — do not pay",
                "Chuyển khoản demo — không thanh toán",
              ),
              qrObjectKey: null,
              transferReferenceTemplate: "{code}",
              instructions: demoBilingual(
                "This checkout demonstrates Cyfurden's manual handoff. Do not send money; the account is synthetic and the reservation is not fulfilled.",
                "Checkout này minh hoạ quy trình thủ công của Cyfurden. Không chuyển tiền; tài khoản là giả lập và đơn sẽ không được giao.",
              ),
              disclaimer: demoBilingual(
                "Public demo only. No payment is requested or verified.",
                "Chỉ là demo công khai. Không yêu cầu hoặc xác minh thanh toán.",
              ),
            },
          });

          const existingPromotion =
            await transaction.quantityPromotion.findUnique({
              where: { id: DEMO_PROMOTION_ID },
              select: { boothId: true },
            });
          if (
            existingPromotion &&
            existingPromotion.boothId !== DEMO_BOOTH_ID
          ) {
            throw new Error("Refusing to reuse a non-demo promotion record.");
          }
          await transaction.quantityPromotion.upsert({
            where: { id: DEMO_PROMOTION_ID },
            create: {
              id: DEMO_PROMOTION_ID,
              boothId: DEMO_BOOTH_ID,
              name: demoBilingual(
                "Choose 2 paper friends, get 1 weather sheet",
                "Chọn 2 bạn giấy, tặng 1 tờ thời tiết",
              ),
              buyQuantity: 2,
              rewardQuantity: 1,
              active: true,
              repeatable: false,
            },
            update: {
              name: demoBilingual(
                "Choose 2 paper friends, get 1 weather sheet",
                "Chọn 2 bạn giấy, tặng 1 tờ thời tiết",
              ),
              buyQuantity: 2,
              rewardQuantity: 1,
              active: true,
              repeatable: false,
            },
          });
          await transaction.promotionProduct.deleteMany({
            where: { promotionId: DEMO_PROMOTION_ID },
          });
          await transaction.promotionProduct.createMany({
            data: [
              {
                promotionId: DEMO_PROMOTION_ID,
                productId: featuredProductIds[0],
                role: "BUY",
              },
              {
                promotionId: DEMO_PROMOTION_ID,
                productId: featuredProductIds[1],
                role: "BUY",
              },
              {
                promotionId: DEMO_PROMOTION_ID,
                productId: featuredProductIds[2],
                role: "REWARD",
              },
            ],
          });

          const gachaConfig = await transaction.gachaConfig.upsert({
            where: { boothId: DEMO_BOOTH_ID },
            create: {
              boothId: DEMO_BOOTH_ID,
              enabled: true,
              title: demoBilingual("Pocket parade", "Diễu hành tí hon"),
              introduction: demoBilingual(
                "A free digital reveal from the Paper Comet shelf. No purchase, prize, or item entitlement.",
                "Một lượt hé lộ kỹ thuật số miễn phí từ kệ Sao Chổi Giấy. Không cần mua và không trao vật phẩm.",
              ),
              gameTheme: "starlight",
              pityEnabled: true,
              guaranteedAt: 4,
              guaranteedRarity: "EPIC",
              rates: { ...DEFAULT_GACHA_RATES },
            },
            update: {
              enabled: true,
              title: demoBilingual("Pocket parade", "Diễu hành tí hon"),
              introduction: demoBilingual(
                "A free digital reveal from the Paper Comet shelf. No purchase, prize, or item entitlement.",
                "Một lượt hé lộ kỹ thuật số miễn phí từ kệ Sao Chổi Giấy. Không cần mua và không trao vật phẩm.",
              ),
              gameTheme: "starlight",
              pityEnabled: true,
              guaranteedAt: 4,
              guaranteedRarity: "EPIC",
              rates: { ...DEFAULT_GACHA_RATES },
            },
          });
          const existingBanner = await transaction.gachaBanner.findUnique({
            where: { id: DEMO_GACHA_BANNER_ID },
            select: { boothId: true },
          });
          if (existingBanner && existingBanner.boothId !== DEMO_BOOTH_ID) {
            throw new Error(
              "Refusing to reuse a non-demo gacha banner record.",
            );
          }
          await transaction.gachaBanner.upsert({
            where: { id: DEMO_GACHA_BANNER_ID },
            create: {
              id: DEMO_GACHA_BANNER_ID,
              boothId: DEMO_BOOTH_ID,
              title: demoBilingual("Paper Comet shelf", "Kệ Sao Chổi Giấy"),
              copy: demoBilingual(
                "Reveal one illustrated shelf companion. The result stays digital and free.",
                "Hé lộ một người bạn minh hoạ trên kệ. Kết quả chỉ là kỹ thuật số và miễn phí.",
              ),
              type: "COLLECTION",
              theme: "starlight",
              featuredCount: 2,
              active: true,
              sortOrder: 0,
            },
            update: {
              title: demoBilingual("Paper Comet shelf", "Kệ Sao Chổi Giấy"),
              copy: demoBilingual(
                "Reveal one illustrated shelf companion. The result stays digital and free.",
                "Hé lộ một người bạn minh hoạ trên kệ. Kết quả chỉ là kỹ thuật số và miễn phí.",
              ),
              type: "COLLECTION",
              theme: "starlight",
              featuredCount: 2,
              startsAt: null,
              endsAt: null,
              active: true,
              sortOrder: 0,
            },
          });
          await transaction.gachaPoolEntry.deleteMany({
            where: { bannerId: DEMO_GACHA_BANNER_ID },
          });

          let poolIndex = 0;
          for (const product of productSpecs) {
            const productId = products.get(product.key);
            if (!productId) throw new Error("Demo product seed is incomplete.");
            for (const variant of product.variants) {
              const variantRecord = await transaction.productVariant.findUnique(
                {
                  where: {
                    productId_sku: { productId, sku: variant.sku },
                  },
                  select: { id: true },
                },
              );
              if (!variantRecord)
                throw new Error("Demo variant seed is incomplete.");
              await transaction.gachaPoolEntry.create({
                data: {
                  id: `cyfurden-demo-gacha-pool-${poolIndex + 1}`,
                  bannerId: DEMO_GACHA_BANNER_ID,
                  productVariantId: variantRecord.id,
                  displayName: variant.displayName,
                  rarity: variant.rarity,
                  weight: gachaWeights[variant.rarity],
                  featured: poolIndex >= 2,
                  sortOrder: poolIndex,
                },
              });
              poolIndex += 1;
            }
          }

          const banners = await transaction.gachaBanner.findMany({
            where: { boothId: DEMO_BOOTH_ID },
            include: {
              pool: {
                include: { productVariant: { include: { product: true } } },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          });
          const compilation = compileGachaDocument({
            config: gachaConfig,
            banners,
            publishedAt: DEMO_PUBLISHED_AT,
          });
          if (!compilation.success) {
            throw new Error(
              `Demo gacha snapshot is invalid: ${compilation.errors.join(" ")}`,
            );
          }
          await transaction.gachaConfig.update({
            where: { boothId: DEMO_BOOTH_ID },
            data: {
              publishedDocument: compilation.document,
              publishedAt: DEMO_PUBLISHED_AT,
            },
          });

          return {
            boothId: DEMO_BOOTH_ID,
            slug: DEMO_BOOTH_SLUG,
            path: DEMO_BOOTH_PATH,
            productCount: featuredProductIds.length,
            gachaRevealCount: poolIndex,
          };
        },
        { maxWait: 5_000, timeout: 20_000, isolationLevel: "Serializable" },
      );
    } catch (error) {
      const isSerializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (isSerializationConflict && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("Demo seed exhausted its transaction retries.");
}
