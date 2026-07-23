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
import {
  storefrontCornerRadiusPixels,
  type StorefrontDocument,
} from "@/lib/storefront-document";
import styles from "./managed-storefront.module.css";

type ProductDto = {
  id: string;
  name: string;
  eyebrow: string | null;
  shortDescription: string | null;
  description: string;
  priceCents: string;
  featured: boolean;
  tags: string[];
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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [orderState, orderAction, orderPending] = useActionState(
    createPublicOrderAction,
    initialOrderState,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cartPanelRef = useRef<HTMLDivElement>(null);
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
    if (!cartOpen) return;
    previousFocusRef.current = globalThis.document
      .activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    return () => {
      globalThis.document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [cartOpen]);

  useEffect(() => {
    if (orderState.status === "error") orderErrorRef.current?.focus();
  }, [orderState]);
  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (!normalized) return true;
      return [
        product.name,
        product.eyebrow,
        product.shortDescription,
        ...product.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [products, query]);
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
            <input
              className={styles.search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items"
              aria-label="Search products"
            />
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
              <div className={styles.grid}>
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
                      <ProductArt product={product} />
                      <div className={styles.cardCopy}>
                        <p className={styles.cardEyebrow}>
                          {product.eyebrow ?? "New release"}
                        </p>
                        <h3>{product.name}</h3>
                        <p>{product.shortDescription ?? product.description}</p>
                        <div className={styles.cardFooter}>
                          <strong>{money(price)}</strong>
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
        <button
          className={styles.bagButton}
          type="button"
          onClick={() => setCartOpen(true)}
        >
          Bag <span>{cartCount}</span>
        </button>
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
