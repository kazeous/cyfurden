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
import {
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

const money = (minorUnits: bigint | string) =>
  new Intl.NumberFormat("vi-VN", {
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

function availabilityLabel(product: ProductDto) {
  const available = product.variants.find((variant) =>
    isPurchasableVariant(variant.status, variant.stockQuantity),
  );
  if (!available) return "Sold out";
  if (available.stockQuantity !== null) {
    return `${available.stockQuantity} left`;
  }
  return available.status === "PREORDER" ? "Pre-order" : "Available";
}

function ProductQr({ label, url }: { label: string; url: string }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    createSocialQrDataUrl(url)
      .then((value) => {
        if (active) setQrUrl(value);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [url]);

  return qrUrl ? (
    <Image
      className={styles.infoQr}
      src={qrUrl}
      alt={`${label} profile QR code`}
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
}: {
  booth: { id: string; slug: string };
  identity: {
    logoUrl?: string;
    socialLinks: Array<{ id: string; label: string; url: string }>;
  };
  document: StorefrontDocument;
  products: ProductDto[];
  canAcceptReservations: boolean;
}) {
  const [query, setQuery] = useState("");
  const [categorySlug, setCategorySlug] = useState("all");
  const [sort, setSort] = useState<CatalogueSort>("featured");
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

  const visibleSectionOrder = document.sectionOrder.filter((section) =>
    document.visibleSections.includes(section),
  );

  const renderSection = (section: (typeof document.sectionOrder)[number]) => {
    switch (section) {
      case "featured":
        return (
          <section className={`${styles.storeSection} ${styles.featured}`}>
            <p className={styles.eyebrow}>{document.announcement}</p>
            <h1>{document.tagline}</h1>
            <p>{document.introduction}</p>
            <div className={styles.heroMeta}>
              <span>{document.eventStatusLabel}</span>
              <span>{document.eventHours}</span>
            </div>
          </section>
        );
      case "booth-info":
        return (
          <aside className={`${styles.storeSection} ${styles.boothInfo}`}>
            <p className={styles.eyebrow}>Booth guide</p>
            <h2>{document.creatorName}</h2>
            <p>{document.creatorBio}</p>
            {document.creatorLocation ? (
              <small>{document.creatorLocation}</small>
            ) : null}
            {identity.socialLinks.length ? (
              <nav className={styles.socialLinks} aria-label="Creator profiles">
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
              {document.eventVenue} · {document.eventBoothLabel}
            </small>
            <button
              type="button"
              className={styles.infoButton}
              onClick={() => setInfoOpen(true)}
            >
              Open booth info
            </button>
          </aside>
        );
      case "browse":
        return (
          <section
            className={`${styles.storeSection} ${styles.browseControls}`}
            aria-label="Browse products"
          >
            <div>
              <p className={styles.eyebrow}>Browse the booth</p>
              <strong>
                {visibleProducts.length} of {products.length} pieces shown
              </strong>
            </div>
            <div className={styles.catalogueControls}>
              <input
                className={styles.search}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search items"
                aria-label="Search products"
              />
              <select
                className={styles.select}
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as CatalogueSort)
                }
                aria-label="Sort products"
              >
                <option value="featured">Featured first</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name: A to Z</option>
              </select>
              <select
                className={styles.select}
                value={categorySlug}
                onChange={(event) => setCategorySlug(event.target.value)}
                aria-label="Filter products by category"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option value={category.slug} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <div className={styles.viewToggle} aria-label="Catalogue view">
                <button
                  type="button"
                  className={styles.viewButton}
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </button>
                <button
                  type="button"
                  className={styles.viewButton}
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  List
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
                <p className={styles.eyebrow}>Product collection</p>
                <h2 id="catalogue-heading">Find a small wonder</h2>
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
                        aria-label={`View details for ${product.name}`}
                      >
                        <ProductArt product={product} />
                      </button>
                      <div className={styles.cardCopy}>
                        <div className={styles.cardHeading}>
                          <p className={styles.cardEyebrow}>
                            {product.eyebrow ?? "New release"}
                          </p>
                          <div className={styles.badges}>
                            {product.featured ? (
                              <span className={styles.badge}>Featured</span>
                            ) : null}
                            <span className={styles.badge}>
                              {availabilityLabel(product)}
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
                        <p>{product.shortDescription ?? product.description}</p>
                        {product.tags.length ? (
                          <div className={styles.tagList} aria-label="Tags">
                            {product.tags.slice(0, 3).map((tag) => (
                              <span key={tag}>#{tag}</span>
                            ))}
                          </div>
                        ) : null}
                        <div className={styles.cardFooter}>
                          <strong>{money(price)}</strong>
                          <div className={styles.cardActions}>
                            <button
                              type="button"
                              className={styles.detailsButton}
                              onClick={() => openDetails(product)}
                            >
                              Details
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
                                ? "Reservations paused"
                                : atStockLimit
                                  ? "Stock limit reached"
                                  : available
                                    ? "Add to bag"
                                    : "Sold out"}
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
                <h3>No matching merch</h3>
                <p>Try a different search.</p>
              </div>
            )}
          </section>
        );
      case "cart":
        return (
          <section className={`${styles.storeSection} ${styles.cartSummary}`}>
            <p className={styles.eyebrow}>Shopping cart</p>
            <span className={styles.cartSummaryIcon} aria-hidden="true">
              ▣
            </span>
            <h2>
              {cartCount
                ? `${cartCount} item${cartCount === 1 ? "" : "s"}`
                : "Your bag is empty"}
            </h2>
            <p>
              {cartCount
                ? `${money(totalCents)} ready for manual reservation.`
                : "Add a piece from the collection to begin."}
            </p>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => setCartOpen(true)}
            >
              {cartCount ? "Review bag" : "Open bag"}
            </button>
            <small>
              {canAcceptReservations
                ? "Manual bank transfer · no automatic verification"
                : "Reservations are paused until payment instructions are ready"}
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
            <strong>{document.name}</strong>
            <small>
              {document.eventName} · {document.eventBoothLabel}
            </small>
          </span>
        </div>
        <div className={styles.topbarActions}>
          <button
            className={styles.infoButton}
            type="button"
            onClick={() => setInfoOpen(true)}
          >
            Booth info
          </button>
          <button
            className={styles.bagButton}
            type="button"
            onClick={() => setCartOpen(true)}
          >
            Bag <span>{cartCount}</span>
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
              key={section}
            >
              {renderSection(section)}
            </div>
          ))}
        </div>

        <footer className={styles.footer}>
          <span>{document.eventFulfillment}</span>
          <span>Manual bank-transfer handoff · no automatic verification</span>
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
                <p className={styles.eyebrow}>Product detail</p>
                <h2 id="product-detail-heading">{detailProduct.name}</h2>
              </div>
              <button
                ref={detailCloseButtonRef}
                type="button"
                className={styles.close}
                onClick={() => setDetailProduct(null)}
                aria-label="Close product details"
              >
                Ã—
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
                    aria-label="Product images"
                  >
                    {detailProduct.images.map((image, index) => (
                      <button
                        key={`${image.objectKey}-${index}`}
                        type="button"
                        className={`${styles.thumbnail} ${index === detailImageIndex ? styles.thumbnailActive : ""}`}
                        onClick={() => setDetailImageIndex(index)}
                        aria-label={`Show image ${index + 1}`}
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
                  {detailProduct.eyebrow ?? "New release"}
                </p>
                <p className={styles.detailDescription}>
                  {detailProduct.description}
                </p>
                {detailProduct.tags.length ? (
                  <div className={styles.tagList} aria-label="Tags">
                    {detailProduct.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                ) : null}
                {detailProduct.variants.length > 1 ? (
                  <label className={styles.detailField}>
                    Choose an option
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
                            : " — unavailable"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : selectedDetailVariant ? (
                  <p className={styles.detailOption}>
                    Option: <strong>{selectedDetailVariant.label}</strong>
                  </p>
                ) : null}
                <div className={styles.detailPriceRow}>
                  <strong>
                    {money(
                      selectedDetailVariant?.priceCents ??
                        detailProduct.priceCents,
                    )}
                  </strong>
                  <span>{availabilityLabel(detailProduct)}</span>
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
                      aria-label="Remove one"
                    >
                      âˆ’
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
                      aria-label="Add one"
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
                      ? "Reservations paused"
                      : selectedDetailVariant &&
                          isPurchasableVariant(
                            selectedDetailVariant.status,
                            selectedDetailVariant.stockQuantity,
                          )
                        ? "Add to bag"
                        : "Sold out"}
                  </button>
                </div>
                <p className={styles.disclaimer}>
                  Reserve without an account. Payment instructions appear only
                  after submitting the reservation.
                </p>
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
                <p className={styles.eyebrow}>Booth guide</p>
                <h2 id="booth-info-heading">{document.name}</h2>
              </div>
              <button
                ref={infoCloseButtonRef}
                type="button"
                className={styles.close}
                onClick={() => setInfoOpen(false)}
                aria-label="Close booth info"
              >
                Ã—
              </button>
            </div>
            <div className={styles.infoGrid}>
              <div>
                <h3>{document.creatorName}</h3>
                <p>{document.creatorBio}</p>
                {document.creatorLocation ? (
                  <p className={styles.detailNote}>
                    {document.creatorLocation}
                  </p>
                ) : null}
              </div>
              <div className={styles.eventDetails}>
                <strong>{document.eventName}</strong>
                <span>{document.eventVenue}</span>
                <span>{document.eventBoothLabel}</span>
                <span>{document.eventHours}</span>
                <span>{document.eventStatusLabel}</span>
              </div>
            </div>
            {identity.socialLinks.length ? (
              <div className={styles.infoSocials}>
                <h3>Find the creator online</h3>
                <div className={styles.infoSocialGrid}>
                  {identity.socialLinks.map((social) => (
                    <a
                      className={styles.infoSocial}
                      href={social.url}
                      key={social.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ProductQr label={social.label} url={social.url} />
                      <span>
                        <strong>{social.label}</strong>
                        <small>Open profile</small>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            <p className={styles.infoFulfillment}>
              {document.eventFulfillment}
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
                <p className={styles.eyebrow}>Shopping cart</p>
                <h2 id="bag-heading">Your bag</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.close}
                onClick={() => setCartOpen(false)}
                aria-label="Close bag"
                disabled={orderPending}
              >
                ×
              </button>
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
                          <small>{variant.stockQuantity} available</small>
                        ) : null}
                      </div>
                      <div className={styles.quantity}>
                        <button
                          type="button"
                          onClick={() => adjust(variant.id, -1)}
                          aria-label={`Remove one ${product.name}`}
                          disabled={orderPending}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjust(variant.id, 1)}
                          aria-label={`Add one ${product.name}`}
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
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className={styles.total}>
                  <span>Total</span>
                  <strong>{money(totalCents)}</strong>
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
                    Name
                    <input
                      name="customerName"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Your name"
                      disabled={orderPending}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="customerEmail"
                      type="email"
                      required
                      maxLength={254}
                      placeholder="you@example.com"
                      disabled={orderPending}
                    />
                  </label>
                  <label>
                    Note (optional)
                    <textarea
                      name="customerNote"
                      maxLength={500}
                      placeholder="Pickup notes or questions"
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
                    {orderPending ? "Saving reservation…" : "Send reservation"}
                  </button>
                  <p className={styles.disclaimer}>
                    You will receive manual bank-transfer instructions after
                    submitting. Cyfurden does not verify payment automatically.
                  </p>
                </form>
              </>
            ) : (
              <div className={styles.empty}>
                <h3>Your bag is empty</h3>
                <p>Add an item to start a reservation.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
