"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicOrderAction,
  type PublicOrderState,
} from "@/app/s/[slug]/actions";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import {
  isPurchasableVariant,
  maximumPurchasableQuantity,
} from "@/lib/order-rules";
import { filterAndSortCatalogue, type CatalogueSort } from "@/lib/catalogue";
import { createSocialQrDataUrl } from "@/lib/social-qr";
import { parseBilingual, translate, type Locale } from "@/lib/i18n";
import {
  resolveStorefrontFeaturedProductIds,
  storefrontCornerRadiusPixels,
  type StorefrontDocument,
} from "@/lib/storefront-document";
import styles from "./managed-storefront.module.css";

type ProductDto = {
  id: string;
  category: { id: string; name: string; slug: string } | null;
  name: string;
  eyebrow: string | null;
  shortDescription: string | null;
  description: string;
  priceCents: string;
  sku: string | null;
  featured: boolean;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  images: { objectKey: string; alt: string }[];
  variants: {
    id: string;
    label: string;
    priceCents: string | null;
    status: string;
    stockQuantity: number | null;
    fulfillmentNote: string | null;
  }[];
};

type CartLine = { productId: string; variantId: string; quantity: number };

const initialOrderState: PublicOrderState = { status: "idle", message: "" };

const money = (minorUnits: bigint | string, locale: Locale = "en") =>
  new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(minorUnits) / BigInt(100));

const createIdempotencyKey = () => globalThis.crypto.randomUUID();

function readPersistedCart(
  value: string | null,
  products: ProductDto[],
): { cart: CartLine[]; idempotencyKey: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      cart?: unknown;
      idempotencyKey?: unknown;
    };
    if (!Array.isArray(parsed.cart)) return null;

    const cart = parsed.cart.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const line = candidate as Partial<CartLine>;
      const product = products.find((item) => item.id === line.productId);
      const variant = product?.variants.find(
        (item) => item.id === line.variantId,
      );
      if (
        !product ||
        !variant ||
        !isPurchasableVariant(variant.status, variant.stockQuantity) ||
        typeof line.quantity !== "number" ||
        !Number.isInteger(line.quantity)
      ) {
        return [];
      }
      const quantity = Math.min(
        Math.max(1, line.quantity),
        maximumPurchasableQuantity(variant.stockQuantity),
      );
      return [{ productId: product.id, variantId: variant.id, quantity }];
    });

    return {
      cart,
      idempotencyKey:
        typeof parsed.idempotencyKey === "string" &&
        /^[0-9a-f-]{36}$/i.test(parsed.idempotencyKey)
          ? parsed.idempotencyKey
          : createIdempotencyKey(),
    };
  } catch {
    return null;
  }
}

function ProductArt({ product }: { product: ProductDto }) {
  const image = product.images[0];
  const imageUrl = image ? resolveOracleImageUrl(image) : undefined;
  return (
    <div className={styles.productArt}>
      {imageUrl ? (
        <span
          className={styles.remoteArt}
          style={{ backgroundImage: `url("${imageUrl}")` }}
          aria-hidden="true"
        />
      ) : (
        <>
          <span className={styles.artSun} aria-hidden="true" />
          <span className={styles.artMoon} aria-hidden="true" />
          <span className={styles.artHill} aria-hidden="true" />
        </>
      )}
      <span className={styles.artLabel}>{product.name}</span>
    </div>
  );
}

function CarouselArrow({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={
          direction === "previous"
            ? "m12.5 4.5-5.5 5.5 5.5 5.5"
            : "m7.5 4.5 5.5 5.5-5.5 5.5"
        }
      />
    </svg>
  );
}

function CatalogueIcon({ name }: { name: "grid" | "list" | "search" }) {
  if (name === "search") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="8.75" cy="8.75" r="5.25" />
        <path d="m12.75 12.75 3.75 3.75" />
      </svg>
    );
  }

  if (name === "grid") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
        <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
        <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
        <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle cx="3.5" cy="5" r=".75" />
      <circle cx="3.5" cy="10" r=".75" />
      <circle cx="3.5" cy="15" r=".75" />
    </svg>
  );
}

function availabilityLabel(product: ProductDto, t: import("@/lib/i18n").PublicBoothStrings) {
  const available = product.variants.find((variant) =>
    isPurchasableVariant(variant.status, variant.stockQuantity),
  );
  if (!available) return t.productDetailAvailabilitySoldOut;
  if (available.stockQuantity !== null) {
    return t.productDetailAvailabilityLeft(available.stockQuantity);
  }
  return available.status === "PREORDER"
    ? t.productDetailAvailabilityPreorder
    : t.productDetailAvailabilityAvailable;
}

function ProductQr({
  label,
  url,
  centerLogoUrl,
  alt,
}: {
  label: string;
  url: string;
  centerLogoUrl?: string;
  alt: string;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    createSocialQrDataUrl(url, { centerLogoUrl })
      .then((value) => {
        if (active) setQrUrl(value);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [url, centerLogoUrl]);

  return qrUrl ? (
    <Image
      className={styles.infoQr}
      src={qrUrl}
      alt={alt}
      width={62}
      height={62}
      unoptimized
    />
  ) : (
    <span className={styles.infoQrFallback} aria-hidden="true">
      QR
    </span>
  );
}

export function ManagedStorefront({
  booth,
  identity,
  document,
  products,
  canAcceptReservations,
  locale = "en",
}: {
  booth: { id: string; slug: string };
  identity: {
    logoUrl?: string;
    socialLinks: Array<{ id: string; label: string; url: string }>;
  };
  document: StorefrontDocument;
  products: ProductDto[];
  canAcceptReservations: boolean;
  locale?: Locale;
}) {
  const [query, setQuery] = useState("");
  const [categorySlug, setCategorySlug] = useState("all");
  const [sort, setSort] = useState<CatalogueSort>("featured");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductDto | null>(null);
  const [detailVariantId, setDetailVariantId] = useState<string | null>(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [infoOpen, setInfoOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [orderState, orderAction, orderPending] = useActionState(
    createPublicOrderAction,
    initialOrderState,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement>(null);
  const infoCloseButtonRef = useRef<HTMLButtonElement>(null);
  const cartPanelRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const orderErrorRef = useRef<HTMLParagraphElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const storageKey = `cyfurden:cart:${booth.slug}`;
  const t = useMemo(() => translate(locale, "publicBooth"), [locale]);
  const b = useMemo(
    () => (value: string | null | undefined) => parseBilingual(value, locale),
    [locale],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let persisted: ReturnType<typeof readPersistedCart> = null;
      try {
        persisted = readPersistedCart(
          window.localStorage.getItem(storageKey),
          products,
        );
      } catch {
        // Storage can be unavailable in hardened/private browsing contexts.
      }
      setCart(persisted?.cart ?? []);
      setIdempotencyKey(persisted?.idempotencyKey ?? createIdempotencyKey());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [products, storageKey]);

  useEffect(() => {
    if (typeof globalThis.document === "undefined") return;
    globalThis.document.documentElement.lang = locale;
    return () => {
      globalThis.document.documentElement.lang = "en";
    };
  }, [locale]);

  useEffect(() => {
    if (!hydrated || !idempotencyKey) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ cart, idempotencyKey }),
      );
    } catch {
      // The in-memory bag remains usable when persistence is unavailable.
    }
  }, [cart, hydrated, idempotencyKey, storageKey]);

  useEffect(() => {
    if (!cartOpen && !detailProduct && !infoOpen) return;
    previousFocusRef.current = globalThis.document
      .activeElement as HTMLElement | null;
    if (cartOpen) closeButtonRef.current?.focus();
    else if (detailProduct) detailCloseButtonRef.current?.focus();
    else infoCloseButtonRef.current?.focus();
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    return () => {
      globalThis.document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [cartOpen, detailProduct, infoOpen]);

  useEffect(() => {
    if (orderState.status === "error") orderErrorRef.current?.focus();
  }, [orderState]);
  const categories = useMemo(
    () =>
      products
        .flatMap((product) => (product.category ? [product.category] : []))
        .filter(
          (category, index, all) =>
            all.findIndex((item) => item.slug === category.slug) === index,
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );
  const visibleProducts = useMemo(
    () =>
      filterAndSortCatalogue(
        products.map((product) => ({
          ...product,
          categorySlug: product.category?.slug ?? null,
        })),
        {
          query,
          categorySlug,
          sort,
        },
      ),
    [categorySlug, products, query, sort],
  );
  const featuredProducts = useMemo(() => {
    const featuredProductIds = resolveStorefrontFeaturedProductIds(
      document,
      products,
    );
    return featuredProductIds.flatMap((productId) => {
      const product = products.find((item) => item.id === productId);
      return product ? [product] : [];
    });
  }, [document, products]);

  const selectedDetailVariant = detailProduct?.variants.find(
    (variant) => variant.id === detailVariantId,
  );
  const detailImage = detailProduct?.images[detailImageIndex];
  const cartDetails = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    const variant = product?.variants.find(
      (item) => item.id === line.variantId,
    );
    return product && variant ? [{ line, product, variant }] : [];
  });
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const totalCents = cartDetails.reduce(
    (sum, detail) =>
      sum +
      BigInt(detail.variant.priceCents ?? detail.product.priceCents) *
        BigInt(detail.line.quantity),
    BigInt(0),
  );

  const updateCart = (updater: (current: CartLine[]) => CartLine[]) => {
    setCart((current) => updater(current));
    setIdempotencyKey(createIdempotencyKey());
  };

  const add = (product: ProductDto) => {
    if (!canAcceptReservations) return;
    const variant = product.variants.find((item) =>
      isPurchasableVariant(item.status, item.stockQuantity),
    );
    if (!variant) return;
    updateCart((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      const maximum = maximumPurchasableQuantity(variant.stockQuantity);
      return existing
        ? current.map((line) =>
            line.variantId === variant.id
              ? { ...line, quantity: Math.min(maximum, line.quantity + 1) }
              : line,
          )
        : [
            ...current,
            { productId: product.id, variantId: variant.id, quantity: 1 },
          ];
    });
    setCartOpen(true);
  };

  const openDetails = (product: ProductDto) => {
    const firstVariant =
      product.variants.find((variant) =>
        isPurchasableVariant(variant.status, variant.stockQuantity),
      ) ?? product.variants[0];
    setDetailProduct(product);
    setDetailVariantId(firstVariant?.id ?? null);
    setDetailImageIndex(0);
    setDetailQuantity(1);
  };

  const addDetailToCart = () => {
    if (!detailProduct || !selectedDetailVariant || !canAcceptReservations) {
      return;
    }
    const maximum = maximumPurchasableQuantity(
      selectedDetailVariant.stockQuantity,
    );
    const quantity = Math.min(Math.max(1, detailQuantity), maximum);
    updateCart((current) => {
      const existing = current.find(
        (line) => line.variantId === selectedDetailVariant.id,
      );
      return existing
        ? current.map((line) =>
            line.variantId === selectedDetailVariant.id
              ? {
                  ...line,
                  quantity: Math.min(maximum, line.quantity + quantity),
                }
              : line,
          )
        : [
            ...current,
            {
              productId: detailProduct.id,
              variantId: selectedDetailVariant.id,
              quantity,
            },
          ];
    });
    setDetailProduct(null);
    setCartOpen(true);
  };

  const adjust = (variantId: string, delta: number) => {
    updateCart((current) =>
      current.flatMap((line) => {
        if (line.variantId !== variantId) return [line];
        const detail = cartDetails.find(
          (entry) => entry.variant.id === variantId,
        );
        const maximum = maximumPurchasableQuantity(
          detail?.variant.stockQuantity ?? null,
        );
        const quantity = Math.min(maximum, line.quantity + delta);
        return quantity > 0 ? [{ ...line, quantity }] : [];
      }),
    );
  };

  const removeLine = (variantId: string) => {
    updateCart((current) => current.filter((line) => line.variantId !== variantId));
  };

  const clearCart = () => {
    updateCart(() => []);
  };

  const handleCartKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setCartOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = cartPanelRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleDetailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDetailProduct(null);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = detailPanelRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleInfoKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setInfoOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = infoPanelRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href]",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const visibleSectionOrder = useMemo(
    () =>
      document.sectionOrder.filter((section) =>
        document.visibleSections.includes(section),
      ),
    [document.sectionOrder, document.visibleSections],
  );
  const sectionGridRows = useMemo(() => {
    const rows = {} as Record<
      StorefrontDocument["sectionOrder"][number],
      number
    >;
    let wideRow = 0;
    let sideRow = 0;

    for (const section of visibleSectionOrder) {
      if (section === "booth-info" || section === "cart") {
        sideRow = Math.max(sideRow + 1, Math.max(1, wideRow));
        rows[section] = sideRow;
      } else {
        wideRow += 1;
        rows[section] = wideRow;
      }
    }

    return rows;
  }, [visibleSectionOrder]);

  const renderSection = (section: (typeof document.sectionOrder)[number]) => {
    switch (section) {
      case "featured": {
        const featuredProduct = featuredProducts[featuredIndex];
        if (!featuredProduct) {
          return (
            <section
              className={`${styles.storeSection} ${styles.featured} ${styles.featuredEmpty}`}
            >
              <p className={styles.featuredAnnouncement}>
                {b(document.announcement)}
              </p>
              <h1>{b(document.tagline)}</h1>
              <p>{b(document.introduction)}</p>
              <div className={styles.heroMeta}>
                <span>{b(document.eventStatusLabel)}</span>
                <span>{b(document.eventHours)}</span>
              </div>
            </section>
          );
        }

        const available = featuredProduct.variants.some((variant) =>
          isPurchasableVariant(variant.status, variant.stockQuantity),
        );
        const firstAvailableVariant = featuredProduct.variants.find((variant) =>
          isPurchasableVariant(variant.status, variant.stockQuantity),
        );
        const price =
          firstAvailableVariant?.priceCents ?? featuredProduct.priceCents;
        const cartLine = firstAvailableVariant
          ? cart.find((line) => line.variantId === firstAvailableVariant.id)
          : undefined;
        const atStockLimit = Boolean(
          firstAvailableVariant &&
            cartLine &&
            cartLine.quantity >=
              maximumPurchasableQuantity(firstAvailableVariant.stockQuantity),
        );
        const stackedProducts = [
          ...featuredProducts.slice(featuredIndex + 1),
          ...featuredProducts.slice(0, featuredIndex),
        ].slice(0, 2);

        return (
          <section
            className={`${styles.storeSection} ${styles.featured}`}
            aria-label={t.featuredCarouselA11y.landmark}
            aria-roledescription="carousel"
            onKeyDown={(event) => {
              if (featuredProducts.length < 2) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setFeaturedIndex(
                  (current) =>
                    (current - 1 + featuredProducts.length) %
                    featuredProducts.length,
                );
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setFeaturedIndex(
                  (current) => (current + 1) % featuredProducts.length,
                );
              }
            }}
          >
            <div
              className={styles.featuredSlide}
              role="group"
              aria-roledescription="slide"
              aria-label={t.featuredCarouselA11y.slidePosition(
                featuredIndex + 1,
                featuredProducts.length,
              )}
            >
              <div className={styles.featuredCopy}>
                <p className={styles.featuredAnnouncement}>
                  {b(document.announcement)}
                </p>
                <strong className={styles.featuredTagline}>
                  {b(document.tagline)}
                </strong>
                <p className={styles.featuredProductLabel}>
                  {featuredProduct.eyebrow ?? t.featuredProductEyebrow}
                </p>
                <h1>{featuredProduct.name}</h1>
                <p className={styles.featuredDescription}>
                  {featuredProduct.shortDescription ??
                    featuredProduct.description}
                </p>
                <p className={styles.featuredWelcome}>
                  {b(document.introduction)}
                </p>
                <div className={styles.featuredFacts}>
                  <strong>{money(price, locale)}</strong>
                  <span>{availabilityLabel(featuredProduct, t)}</span>
                </div>
                <div className={styles.featuredActions}>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={() => add(featuredProduct)}
                    disabled={
                      !available || !canAcceptReservations || atStockLimit
                    }
                  >
                    {!canAcceptReservations
                      ? t.productDetailReservationsPaused
                      : atStockLimit
                        ? t.productDetailStockLimitReached
                        : available
                          ? t.productDetailAddToBag
                          : t.productDetailSoldOut}
                  </button>
                  <button
                    type="button"
                    className={styles.detailsButton}
                    onClick={() => openDetails(featuredProduct)}
                  >
                    {t.featuredSeeItem}
                  </button>
                </div>
                <div className={styles.featuredNavigation}>
                  <button
                    type="button"
                    className={styles.featuredArrow}
                    onClick={() =>
                      setFeaturedIndex(
                        (current) =>
                          (current - 1 + featuredProducts.length) %
                          featuredProducts.length,
                      )
                    }
                    disabled={featuredProducts.length < 2}
                    aria-label={t.featuredCarouselA11y.prev}
                  >
                    <CarouselArrow direction="previous" />
                  </button>
                  <div
                    className={styles.featuredDots}
                    role="group"
                    aria-label={t.featuredCarouselA11y.dots}
                  >
                    {featuredProducts.map((product, index) => (
                      <button
                        type="button"
                        key={product.id}
                        aria-label={t.featuredCarouselA11y.slide(product.name)}
                        aria-current={
                          index === featuredIndex ? "true" : undefined
                        }
                        onClick={() => setFeaturedIndex(index)}
                      />
                    ))}
                  </div>
                  <span className={styles.featuredCount} aria-live="polite">
                    {String(featuredIndex + 1).padStart(2, "0")} /{" "}
                    {String(featuredProducts.length).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    className={styles.featuredArrow}
                    onClick={() =>
                      setFeaturedIndex(
                        (current) => (current + 1) % featuredProducts.length,
                      )
                    }
                    disabled={featuredProducts.length < 2}
                    aria-label={t.featuredCarouselA11y.next}
                  >
                    <CarouselArrow direction="next" />
                  </button>
                </div>
              </div>
              <div className={styles.featuredVisual}>
                {stackedProducts.map((product, index) => (
                  <div
                    className={styles.featuredGhost}
                    data-stack={index + 1}
                    key={product.id}
                    aria-hidden="true"
                  >
                    <ProductArt product={product} />
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.featuredArtButton}
                  onClick={() => openDetails(featuredProduct)}
                  aria-label={t.featuredCarouselA11y.artButton(
                    featuredProduct.name,
                  )}
                >
                  <ProductArt product={featuredProduct} />
                  <span>{availabilityLabel(featuredProduct, t)}</span>
                </button>
              </div>
            </div>
          </section>
        );
      }
      case "booth-info":
        return (
          <aside className={`${styles.storeSection} ${styles.boothInfo}`}>
            <p className={styles.eyebrow}>{t.boothGuideEyebrow}</p>
            <h2>{b(document.creatorName)}</h2>
            <p>{b(document.creatorBio)}</p>
            {document.creatorLocation ? (
              <small>{b(document.creatorLocation)}</small>
            ) : null}
            {identity.socialLinks.length ? (
              <nav className={styles.socialLinks} aria-label={t.creatorProfilesAria}>
                {identity.socialLinks.map((social) => (
                  <a
                    href={social.url}
                    key={social.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {social.label}
                  </a>
                ))}
              </nav>
            ) : null}
            <small>
              {b(document.eventVenue)} · {b(document.eventBoothLabel)}
            </small>
            <button
              type="button"
              className={styles.infoButton}
              onClick={() => setInfoOpen(true)}
            >
              {t.boothInfoOpen}
            </button>
          </aside>
        );
      case "browse":
        return (
          <section
            className={`${styles.storeSection} ${styles.browseControls}`}
            aria-label={t.browseTitle}
          >
            <div
              className={styles.categoryRail}
              role="group"
              aria-label={t.browseTitle}
            >
              <button
                type="button"
                className={styles.categoryButton}
                aria-pressed={categorySlug === "all"}
                onClick={() => setCategorySlug("all")}
              >
                {t.browseAllLabel}
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  className={styles.categoryButton}
                  aria-pressed={categorySlug === category.slug}
                  onClick={() => setCategorySlug(category.slug)}
                  key={category.id}
                >
                  {category.name}
                </button>
              ))}
              <span className={styles.resultsCount} aria-live="polite">
                {visibleProducts.length} / {products.length}
              </span>
            </div>
            <div className={styles.catalogueControls}>
              <label className={styles.searchField}>
                <CatalogueIcon name="search" />
                <input
                  className={styles.search}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.browseSearchPlaceholder}
                  aria-label={t.browseSearchPlaceholder}
                />
              </label>
              <select
                className={styles.select}
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as CatalogueSort)
                }
                aria-label={t.browseSortAria}
              >
                <option value="featured">{t.browseSortFeatured}</option>
                <option value="newest">{t.browseSortNewest}</option>
                <option value="price-asc">{t.browseSortPriceAsc}</option>
                <option value="price-desc">{t.browseSortPriceDesc}</option>
                <option value="name">{t.browseSortName}</option>
              </select>
              <div
                className={styles.viewToggle}
                role="group"
                aria-label={t.browseViewAria}
              >
                <button
                  type="button"
                  className={styles.viewButton}
                  aria-label={t.browseViewGrid}
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  <CatalogueIcon name="grid" />
                </button>
                <button
                  type="button"
                  className={styles.viewButton}
                  aria-label={t.browseViewList}
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  <CatalogueIcon name="list" />
                </button>
              </div>
            </div>
          </section>
        );
      case "catalogue":
        return (
          <section
            className={`${styles.storeSection} ${styles.catalogue}`}
            aria-labelledby="catalogue-heading"
          >
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>{t.catalogueEyebrow}</p>
                <h2 id="catalogue-heading">{t.catalogueTitle}</h2>
              </div>
            </div>
            {visibleProducts.length ? (
              <div
                className={`${styles.grid} ${viewMode === "list" ? styles.list : ""}`}
              >
                {visibleProducts.map((product) => {
                  const available = product.variants.some((variant) =>
                    isPurchasableVariant(variant.status, variant.stockQuantity),
                  );
                  const firstAvailableVariant = product.variants.find(
                    (variant) =>
                      isPurchasableVariant(
                        variant.status,
                        variant.stockQuantity,
                      ),
                  );
                  const price =
                    firstAvailableVariant?.priceCents ?? product.priceCents;
                  const cartLine = firstAvailableVariant
                    ? cart.find(
                        (line) => line.variantId === firstAvailableVariant.id,
                      )
                    : undefined;
                  const atStockLimit = Boolean(
                    firstAvailableVariant &&
                      cartLine &&
                      cartLine.quantity >=
                        maximumPurchasableQuantity(
                          firstAvailableVariant.stockQuantity,
                        ),
                  );
                  return (
                    <article className={styles.card} key={product.id}>
                      <button
                        type="button"
                        className={styles.artButton}
                        onClick={() => openDetails(product)}
                        aria-label={t.featuredCarouselA11y.artButton(
                          product.name,
                        )}
                      >
                        <ProductArt product={product} />
                      </button>
                      <div className={styles.cardCopy}>
                        <div className={styles.cardHeading}>
                          <p className={styles.cardEyebrow}>
                            {product.eyebrow ?? t.newReleaseEyebrow}
                          </p>
                          <div className={styles.badges}>
                            {product.featured ? (
                              <span className={styles.badge}>
                                {t.featuredBadge}
                              </span>
                            ) : null}
                            <span className={styles.badge}>
                              {availabilityLabel(product, t)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.productTitle}
                          onClick={() => openDetails(product)}
                        >
                          {product.name}
                        </button>
                        {product.sku ? (
                          <span className={styles.skuChip}>SKU {product.sku}</span>
                        ) : null}
                        <p>{product.shortDescription ?? product.description}</p>
                        {product.tags.length ? (
                          <div className={styles.tagList} aria-label={t.tagAriaLabel}>
                            {product.tags.slice(0, 3).map((tag) => (
                              <span key={tag}>#{tag}</span>
                            ))}
                          </div>
                        ) : null}
                        <div className={styles.cardFooter}>
                          <strong>{money(price, locale)}</strong>
                          <div className={styles.cardActions}>
                            <button
                              type="button"
                              className={styles.detailsButton}
                              onClick={() => openDetails(product)}
                            >
                              {t.productDetailDetails}
                            </button>
                            <button
                              type="button"
                              className={styles.addButton}
                              onClick={() => add(product)}
                              disabled={
                                !available ||
                                !canAcceptReservations ||
                                atStockLimit
                              }
                            >
                              {!canAcceptReservations
                                ? t.productDetailReservationsPaused
                                : atStockLimit
                                  ? t.productDetailStockLimitReached
                                  : available
                                    ? t.productDetailAddToBag
                                    : t.productDetailSoldOut}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <h3>{t.catalogueEmptyHeading}</h3>
                <p>{t.catalogueEmptyHint}</p>
              </div>
            )}
          </section>
        );
      case "cart":
        return (
          <section className={`${styles.storeSection} ${styles.cartSummary}`}>
            <p className={styles.eyebrow}>{t.cartEyebrow}</p>
            <span className={styles.cartSummaryIcon} aria-hidden="true">
              ▣
            </span>
            <h2>
              {cartCount
                ? t.cartTitleItems(cartCount)
                : t.cartTitleEmpty}
            </h2>
            <p>
              {cartCount
                ? t.cartReadyForReservation(money(totalCents, locale))
                : t.cartEmptyHint}
            </p>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => setCartOpen(true)}
            >
              {cartCount ? t.cartReview : t.cartOpen}
            </button>
            <small>
              {canAcceptReservations ? t.cartManualNote : t.cartPausedNote}
            </small>
          </section>
        );
    }
  };

  return (
    <main
      className={styles.app}
      data-theme={document.themePreset}
      style={
        {
          "--accent": document.accentColor,
          "--store-radius": `${storefrontCornerRadiusPixels[document.cornerRadius]}px`,
        } as React.CSSProperties
      }
    >
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            {identity.logoUrl ? (
              <Image
                src={identity.logoUrl}
                alt=""
                width={40}
                height={40}
                unoptimized
              />
            ) : (
              "C"
            )}
          </span>
          <span>
            <strong>{b(document.name)}</strong>
            <small>
              {b(document.eventName)} · {b(document.eventBoothLabel)}
            </small>
          </span>
        </div>
        <div className={styles.topbarActions}>
          <button
            className={styles.infoButton}
            type="button"
            onClick={() => setInfoOpen(true)}
          >
            {t.boothInfoOpen}
          </button>
          <button
            className={styles.bagButton}
            type="button"
            onClick={() => setCartOpen(true)}
          >
            {t.topbarBag} <span>{cartCount}</span>
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.sectionFlow}>
          {visibleSectionOrder.map((section) => (
            <div
              className={
                section === "booth-info" || section === "cart"
                  ? styles.sideSection
                  : styles.wideSection
              }
              data-section={section}
              key={section}
              style={{ gridRow: sectionGridRows[section] }}
            >
              {renderSection(section)}
            </div>
          ))}
        </div>

        <footer className={styles.footer}>
          <span>{b(document.eventFulfillment)}</span>
          <span>{t.publicFooterManual}</span>
        </footer>
      </div>

      {detailProduct ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-detail-heading"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailProduct(null);
          }}
        >
          <div
            className={styles.detailPanel}
            ref={detailPanelRef}
            onKeyDown={handleDetailKeyDown}
          >
            <div className={styles.cartHeader}>
              <div>
                <p className={styles.eyebrow}>{t.productDetailEyebrow}</p>
                <h2 id="product-detail-heading">{detailProduct.name}</h2>
              </div>
              <button
                ref={detailCloseButtonRef}
                type="button"
                className={styles.close}
                onClick={() => setDetailProduct(null)}
                aria-label={t.productDetailClose}
              >
                ×
              </button>
            </div>
            <div className={styles.detailLayout}>
              <div className={styles.detailGallery}>
                {detailImage ? (
                  <div
                    className={styles.detailArt}
                    role="img"
                    aria-label={detailImage.alt || detailProduct.name}
                    style={{
                      backgroundImage: `url("${resolveOracleImageUrl(detailImage)}")`,
                    }}
                  />
                ) : (
                  <ProductArt product={detailProduct} />
                )}
                {detailProduct.images.length > 1 ? (
                  <div
                    className={styles.thumbnailRow}
                    aria-label={t.productDetailImagesAria}
                  >
                    {detailProduct.images.map((image, index) => (
                      <button
                        key={`${image.objectKey}-${index}`}
                        type="button"
                        className={`${styles.thumbnail} ${index === detailImageIndex ? styles.thumbnailActive : ""}`}
                        onClick={() => setDetailImageIndex(index)}
                        aria-label={t.productDetailShowImage(index + 1)}
                        aria-pressed={index === detailImageIndex}
                        style={{
                          backgroundImage: `url("${resolveOracleImageUrl(image)}")`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={styles.detailCopy}>
                <p className={styles.cardEyebrow}>
                  {detailProduct.eyebrow ?? t.newReleaseEyebrow}
                </p>
                <p className={styles.detailDescription}>
                  {detailProduct.description}
                </p>
                {detailProduct.tags.length ? (
                  <div className={styles.tagList} aria-label={t.tagAriaLabel}>
                    {detailProduct.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                ) : null}
                {detailProduct.variants.length > 1 ? (
                  <label className={styles.detailField}>
                    {t.productDetailChooseOption}
                    <select
                      className={styles.select}
                      value={detailVariantId ?? ""}
                      onChange={(event) => {
                        setDetailVariantId(event.target.value);
                        setDetailQuantity(1);
                      }}
                    >
                      {detailProduct.variants.map((variant) => (
                        <option value={variant.id} key={variant.id}>
                          {variant.label}
                          {isPurchasableVariant(
                            variant.status,
                            variant.stockQuantity,
                          )
                            ? ""
                            : t.productDetailUnavailable}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : selectedDetailVariant ? (
                  <p className={styles.detailOption}>
                    {t.productDetailOptionLabel}:{" "}
                    <strong>{selectedDetailVariant.label}</strong>
                  </p>
                ) : null}
                <div className={styles.detailPriceRow}>
                  <strong>
                    {money(
                      selectedDetailVariant?.priceCents ??
                        detailProduct.priceCents,
                      locale,
                    )}
                  </strong>
                  <span>{availabilityLabel(detailProduct, t)}</span>
                </div>
                {selectedDetailVariant?.fulfillmentNote ? (
                  <p className={styles.detailNote}>
                    {selectedDetailVariant.fulfillmentNote}
                  </p>
                ) : null}
                <div className={styles.detailActions}>
                  <div className={styles.quantity}>
                    <button
                      type="button"
                      onClick={() =>
                        setDetailQuantity((current) => Math.max(1, current - 1))
                      }
                      aria-label={t.productDetailRemoveOne}
                    >
                      −
                    </button>
                    <span aria-live="polite">{detailQuantity}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDetailQuantity((current) =>
                          Math.min(
                            maximumPurchasableQuantity(
                              selectedDetailVariant?.stockQuantity ?? null,
                            ),
                            current + 1,
                          ),
                        )
                      }
                      aria-label={t.productDetailAddOne}
                      disabled={
                        !selectedDetailVariant ||
                        detailQuantity >=
                          maximumPurchasableQuantity(
                            selectedDetailVariant.stockQuantity,
                          )
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={addDetailToCart}
                    disabled={
                      !selectedDetailVariant ||
                      !isPurchasableVariant(
                        selectedDetailVariant.status,
                        selectedDetailVariant.stockQuantity,
                      ) ||
                      !canAcceptReservations
                    }
                  >
                    {!canAcceptReservations
                      ? t.productDetailReservationsPaused
                      : selectedDetailVariant &&
                          isPurchasableVariant(
                            selectedDetailVariant.status,
                            selectedDetailVariant.stockQuantity,
                          )
                        ? t.productDetailAddToBag
                        : t.productDetailSoldOut}
                  </button>
                </div>
                <p className={styles.disclaimer}>{t.productDetailDisclaimer}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {infoOpen ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="booth-info-heading"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInfoOpen(false);
          }}
        >
          <div
            className={styles.infoPanel}
            ref={infoPanelRef}
            onKeyDown={handleInfoKeyDown}
          >
            <div className={styles.cartHeader}>
              <div>
                <p className={styles.eyebrow}>{t.boothGuideEyebrow}</p>
                <h2 id="booth-info-heading">{b(document.name)}</h2>
              </div>
              <button
                ref={infoCloseButtonRef}
                type="button"
                className={styles.close}
                onClick={() => setInfoOpen(false)}
                aria-label={t.boothInfoClose}
              >
                ×
              </button>
            </div>
            <div className={styles.infoGrid}>
              <div>
                <h3>{b(document.creatorName)}</h3>
                <p>{b(document.creatorBio)}</p>
                {document.creatorLocation ? (
                  <p className={styles.detailNote}>
                    {b(document.creatorLocation)}
                  </p>
                ) : null}
              </div>
              <div className={styles.eventDetails}>
                <strong>{b(document.eventName)}</strong>
                <span>{b(document.eventVenue)}</span>
                <span>{b(document.eventBoothLabel)}</span>
                <span>{b(document.eventHours)}</span>
                <span>{b(document.eventStatusLabel)}</span>
              </div>
            </div>
            {identity.socialLinks.length ? (
              <div className={styles.infoSocials}>
                <h3>{t.infoSocialsHeading}</h3>
                <div className={styles.infoSocialGrid}>
                  {identity.socialLinks.map((social) => (
                    <a
                      className={styles.infoSocial}
                      href={social.url}
                      key={social.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ProductQr
                        label={social.label}
                        url={social.url}
                        centerLogoUrl={identity.logoUrl}
                        alt={t.socialQrAlt(social.label)}
                      />
                      <span>
                        <strong>{social.label}</strong>
                        <small>{t.socialOpenProfile}</small>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            <p className={styles.infoFulfillment}>
              {b(document.eventFulfillment)}
            </p>
          </div>
        </div>
      ) : null}

      {cartOpen ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bag-heading"
          aria-describedby={
            orderState.status === "error" ? "bag-order-error" : undefined
          }
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !orderPending) {
              setCartOpen(false);
            }
          }}
        >
          <div
            className={styles.cartPanel}
            ref={cartPanelRef}
            onKeyDown={handleCartKeyDown}
          >
            <div className={styles.cartHeader}>
              <div>
                <p className={styles.eyebrow}>{t.cartEyebrow}</p>
                <h2 id="bag-heading">{t.bagHeading}</h2>
              </div>
              <div className={styles.cartHeaderActions}>
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={clearCart}
                  disabled={orderPending || cartCount === 0}
                  aria-label={t.cartClear}
                >
                  {t.cartClear}
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className={styles.close}
                  onClick={() => setCartOpen(false)}
                  aria-label={t.cartClose}
                  disabled={orderPending}
                >
                  ×
                </button>
              </div>
            </div>
            {cartDetails.length ? (
              <>
                <div className={styles.cartLines}>
                  {cartDetails.map(({ line, product, variant }) => (
                    <div className={styles.cartLine} key={variant.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <small>{variant.label}</small>
                        {variant.stockQuantity !== null ? (
                          <small>{t.cartLineAvailable(variant.stockQuantity)}</small>
                        ) : null}
                      </div>
                      <div className={styles.quantity}>
                        <button
                          type="button"
                          onClick={() => adjust(variant.id, -1)}
                          aria-label={t.cartLineRemoveOne(product.name)}
                          disabled={orderPending}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjust(variant.id, 1)}
                          aria-label={t.cartLineAddOne(product.name)}
                          disabled={
                            orderPending ||
                            line.quantity >=
                              maximumPurchasableQuantity(variant.stockQuantity)
                          }
                        >
                          +
                        </button>
                      </div>
                      <strong>
                        {money(
                          BigInt(variant.priceCents ?? product.priceCents) *
                            BigInt(line.quantity),
                          locale,
                        )}
                      </strong>
                      <button
                        type="button"
                        className={styles.cartLineRemove}
                        onClick={() => removeLine(variant.id)}
                        aria-label={t.cartLineRemove}
                        disabled={orderPending}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className={styles.total}>
                  <span>{t.cartTotalLabel}</span>
                  <strong>{money(totalCents, locale)}</strong>
                </div>
                <form
                  action={orderAction}
                  className={styles.orderForm}
                  aria-busy={orderPending}
                >
                  <input type="hidden" name="boothId" value={booth.id} />
                  <input type="hidden" name="slug" value={booth.slug} />
                  <input
                    type="hidden"
                    name="idempotencyKey"
                    value={idempotencyKey}
                  />
                  <input
                    type="hidden"
                    name="lines"
                    value={JSON.stringify(cart)}
                  />
                  <label>
                    {t.cartNameLabel}
                    <input
                      name="customerName"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder={t.cartNamePlaceholder}
                      disabled={orderPending}
                    />
                  </label>
                  <label>
                    {t.cartEmailLabel}
                    <input
                      name="customerEmail"
                      type="email"
                      required
                      maxLength={254}
                      placeholder={t.cartEmailPlaceholder}
                      disabled={orderPending}
                    />
                  </label>
                  <label>
                    {t.cartNoteLabel}
                    <textarea
                      name="customerNote"
                      maxLength={500}
                      placeholder={t.cartNotePlaceholder}
                      disabled={orderPending}
                    />
                  </label>
                  <p
                    id="bag-order-error"
                    className={styles.orderError}
                    ref={orderErrorRef}
                    role={orderState.status === "error" ? "alert" : undefined}
                    tabIndex={orderState.status === "error" ? -1 : undefined}
                  >
                    {orderState.message}
                  </p>
                  <button
                    className={styles.addButton}
                    type="submit"
                    disabled={
                      orderPending ||
                      !hydrated ||
                      !idempotencyKey ||
                      !canAcceptReservations
                    }
                  >
                    {orderPending ? t.cartSubmitPending : t.cartSubmit}
                  </button>
                  <p className={styles.disclaimer}>{t.cartFooter}</p>
                </form>
              </>
            ) : (
              <div className={styles.empty}>
                <h3>{t.cartTitleEmpty}</h3>
                <p>{t.cartEmptyHint}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
