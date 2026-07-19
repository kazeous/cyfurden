"use client";

import { useMemo, useState } from "react";
import { createPublicOrderAction } from "@/app/s/[slug]/actions";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import type { StorefrontDocument } from "@/lib/storefront-document";
import styles from "./managed-storefront.module.css";

type ProductDto = {
  id: string;
  name: string;
  eyebrow: string | null;
  shortDescription: string | null;
  description: string;
  priceCents: number;
  featured: boolean;
  tags: string[];
  images: { objectKey: string; alt: string }[];
  variants: {
    id: string;
    label: string;
    priceCents: number | null;
    status: string;
    stockQuantity: number | null;
  }[];
};

type PaymentDto = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrObjectKey: string | null;
  transferReferenceTemplate: string;
  instructions: string;
  disclaimer: string;
};

type CartLine = { productId: string; variantId: string; quantity: number };

const money = (cents: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(cents / 100);

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
  document,
  products,
  payment,
  orderCode,
}: {
  booth: { id: string; slug: string };
  document: StorefrontDocument;
  products: ProductDto[];
  payment: PaymentDto | null;
  orderCode?: string;
}) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
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
      (detail.variant.priceCents ?? detail.product.priceCents) *
        detail.line.quantity,
    0,
  );

  const add = (product: ProductDto) => {
    const variant = product.variants.find((item) =>
      ["AVAILABLE", "LOW_STOCK", "PREORDER"].includes(item.status),
    );
    if (!variant) return;
    setCart((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      return existing
        ? current.map((line) =>
            line.variantId === variant.id
              ? { ...line, quantity: line.quantity + 1 }
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
    setCart((current) =>
      current.flatMap((line) => {
        if (line.variantId !== variantId) return [line];
        const quantity = line.quantity + delta;
        return quantity > 0 ? [{ ...line, quantity }] : [];
      }),
    );
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
                    ["AVAILABLE", "LOW_STOCK", "PREORDER"].includes(
                      variant.status,
                    ),
                  );
                  const price =
                    product.variants[0]?.priceCents ?? product.priceCents;
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
                            disabled={!available}
                          >
                            {available ? "Add to bag" : "Sold out"}
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
            <small>Manual bank transfer · no automatic verification</small>
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
          "--store-radius":
            document.cornerRadius === "soft"
              ? "16px"
              : document.cornerRadius === "pill"
                ? "38px"
                : "26px",
        } as React.CSSProperties
      }
    >
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            C
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
        {orderCode ? (
          <section className={styles.confirmation} role="status">
            <p className={styles.eyebrow}>Reservation received</p>
            <h1>Keep this reference: {orderCode}</h1>
            <p>
              Your booth owner will review the reservation manually. No bank
              transfer has been verified by Cyfurden.
            </p>
          </section>
        ) : null}
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
        >
          <div className={styles.cartPanel}>
            <div className={styles.cartHeader}>
              <div>
                <p className={styles.eyebrow}>Shopping cart</p>
                <h2 id="bag-heading">Your bag</h2>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={() => setCartOpen(false)}
                aria-label="Close bag"
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
                      </div>
                      <div className={styles.quantity}>
                        <button
                          type="button"
                          onClick={() => adjust(variant.id, -1)}
                          aria-label={`Remove one ${product.name}`}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjust(variant.id, 1)}
                          aria-label={`Add one ${product.name}`}
                        >
                          +
                        </button>
                      </div>
                      <strong>
                        {money(
                          (variant.priceCents ?? product.priceCents) *
                            line.quantity,
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
                  action={createPublicOrderAction}
                  className={styles.orderForm}
                >
                  <input type="hidden" name="boothId" value={booth.id} />
                  <input type="hidden" name="slug" value={booth.slug} />
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
                      placeholder="Your name"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="customerEmail"
                      type="email"
                      required
                      placeholder="you@example.com"
                    />
                  </label>
                  <label>
                    Note (optional)
                    <textarea
                      name="customerNote"
                      placeholder="Pickup notes or questions"
                    />
                  </label>
                  <button className={styles.addButton} type="submit">
                    Send reservation
                  </button>
                  <p className={styles.disclaimer}>
                    You will receive manual bank-transfer instructions after
                    submitting. Cyfurden does not verify payment automatically.
                  </p>
                </form>
                {payment ? (
                  <div className={styles.payment}>
                    <strong>{payment.bankName}</strong>
                    <span>
                      {payment.accountName} · {payment.accountNumber}
                    </span>
                    <small>{payment.instructions}</small>
                  </div>
                ) : null}
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
