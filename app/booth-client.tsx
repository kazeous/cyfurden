"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  booth,
  categories,
  products,
  type CategoryId,
  type Product,
  type ProductVariant,
} from "@/lib/booth-data";
import {
  resolveOracleImageUrl,
  type OracleImageAsset,
} from "@/lib/oracle-images";

type SortMode = "featured" | "price-low" | "price-high" | "name";
type ViewMode = "grid" | "list";

interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

const CART_STORAGE_KEY = "cyfurden-cart-v1";
const paletteClasses = [
  "palette-night",
  "palette-sky",
  "palette-moss",
  "palette-plum",
  "palette-coral",
  "palette-oat",
] as const;

const formatPrice = (priceCents: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(priceCents / 100);

const getVariantPrice = (product: Product, variant: ProductVariant) =>
  variant.priceCents ?? product.priceCents;

const getDefaultVariant = (product: Product) =>
  product.variants.find((variant) => variant.availability.purchasable) ??
  product.variants[0];

const getPalette = (product: Product) =>
  paletteClasses[
    products.findIndex((candidate) => candidate.id === product.id) %
      paletteClasses.length
  ];

function ProductArtwork({
  product,
  image = product.images[0],
  className = "",
}: {
  product: Product;
  image?: OracleImageAsset;
  className?: string;
}) {
  const imageUrl = image ? resolveOracleImageUrl(image) : undefined;
  const backgroundStyle = imageUrl
    ? ({ backgroundImage: `url("${imageUrl}")` } as CSSProperties)
    : undefined;

  return (
    <div
      className={`product-art ${getPalette(product)} ${className}`.trim()}
      role="img"
      aria-label={image?.alt ?? product.name}
    >
      <span className="art-sun" aria-hidden="true" />
      <span className="art-moon" aria-hidden="true" />
      <span className="art-star" aria-hidden="true" />
      <span className="art-hill" aria-hidden="true" />
      <span className="art-creature" aria-hidden="true" />
      {imageUrl ? (
        <span
          className="remote-art"
          style={backgroundStyle}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  onInspect,
  onAdd,
}: {
  product: Product;
  onInspect: (product: Product) => void;
  onAdd: (product: Product, variant: ProductVariant) => void;
}) {
  const variant = getDefaultVariant(product);
  const category = categories.find((entry) => entry.id === product.categoryId);

  return (
    <article className="product-card">
      <span
        className={`product-tag ${variant.availability.purchasable ? "" : "sold-out"}`}
      >
        {variant.availability.label}
      </span>
      <ProductArtwork product={product} />
      <div className="product-card-body">
        <p className="product-category">{category?.label}</p>
        <h3 className="product-title">{product.name}</h3>
        <p className="product-meta">{product.shortDescription}</p>
        <div className="product-actions">
          <span className="product-price">
            {formatPrice(getVariantPrice(product, variant))}
          </span>
          <div className="card-buttons">
            <button
              type="button"
              className="text-button"
              onClick={() => onInspect(product)}
            >
              Details
            </button>
            <button
              type="button"
              className="icon-button compact-icon"
              onClick={() => onAdd(product, variant)}
              disabled={!variant.availability.purchasable}
              aria-label={`Add ${product.name} to bag`}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyCart() {
  return (
    <div className="empty-cart">
      <div>
        <span className="empty-symbol" aria-hidden="true">
          ∪
        </span>
        <h3 className="empty-title">Your bag is taking a nap</h3>
        <p className="muted">
          Add a small wonder from the catalogue and it will wake right up.
        </p>
      </div>
    </div>
  );
}

export function BoothClient() {
  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured),
    [],
  );
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [category, setCategory] = useState<"all" | CategoryId>("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("featured");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const featured = featuredProducts[featuredIndex];

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      try {
        const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
        if (storedCart) {
          const parsed = JSON.parse(storedCart) as unknown;
          if (Array.isArray(parsed)) {
            const safeLines = parsed.filter(
              (line): line is CartLine =>
                typeof line === "object" &&
                line !== null &&
                typeof (line as CartLine).productId === "string" &&
                typeof (line as CartLine).variantId === "string" &&
                Number.isInteger((line as CartLine).quantity) &&
                (line as CartLine).quantity > 0,
            );
            setCart(safeLines);
          }
        }
      } catch {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      } finally {
        setCartHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (cartHydrated) {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    }
  }, [cart, cartHydrated]);

  useEffect(() => {
    if (!selectedProduct && !paymentOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedProduct(null);
        setPaymentOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedProduct, paymentOpen]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visible = products.filter((product) => {
      const matchesCategory =
        category === "all" || product.categoryId === category;
      const haystack = [
        product.name,
        product.eyebrow,
        product.shortDescription,
        ...product.tags,
      ]
        .join(" ")
        .toLocaleLowerCase();

      return (
        matchesCategory &&
        (!normalizedQuery || haystack.includes(normalizedQuery))
      );
    });

    return [...visible].sort((left, right) => {
      if (sortMode === "price-low") return left.priceCents - right.priceCents;
      if (sortMode === "price-high") return right.priceCents - left.priceCents;
      if (sortMode === "name") return left.name.localeCompare(right.name);
      return Number(right.featured) - Number(left.featured);
    });
  }, [category, query, sortMode]);

  const cartDetails = useMemo(
    () =>
      cart.flatMap((line) => {
        const product = products.find((entry) => entry.id === line.productId);
        const variant = product?.variants.find(
          (entry) => entry.id === line.variantId,
        );
        return product && variant ? [{ line, product, variant }] : [];
      }),
    [cart],
  );

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartDetails.reduce(
    (sum, { line, product, variant }) =>
      sum + getVariantPrice(product, variant) * line.quantity,
    0,
  );
  const transferReference = `CYF-${String(cartCount).padStart(2, "0")}-${String(
    Math.round(cartTotal / 100),
  ).slice(-5)}`;

  const addToCart = (product: Product, variant: ProductVariant) => {
    if (!variant.availability.purchasable) return;

    setCart((current) => {
      const index = current.findIndex(
        (line) =>
          line.productId === product.id && line.variantId === variant.id,
      );
      if (index === -1) {
        return [
          ...current,
          { productId: product.id, variantId: variant.id, quantity: 1 },
        ];
      }
      return current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
  };

  const changeQuantity = (line: CartLine, delta: number) => {
    setCart((current) =>
      current.flatMap((candidate) => {
        if (
          candidate.productId !== line.productId ||
          candidate.variantId !== line.variantId
        ) {
          return [candidate];
        }
        const nextQuantity = candidate.quantity + delta;
        return nextQuantity > 0
          ? [{ ...candidate, quantity: nextQuantity }]
          : [];
      }),
    );
  };

  const removeLine = (line: CartLine) => {
    setCart((current) =>
      current.filter(
        (candidate) =>
          candidate.productId !== line.productId ||
          candidate.variantId !== line.variantId,
      ),
    );
  };

  const inspectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedVariantId(getDefaultVariant(product).id);
  };

  const openCart = () => {
    setMobileCartOpen(true);
    document.getElementById("cart")?.scrollIntoView({ block: "start" });
  };

  const copyText = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1600);
    } catch {
      setCopiedField(null);
    }
  };

  const selectedVariant = selectedProduct
    ? (selectedProduct.variants.find(
        (variant) => variant.id === selectedVariantId,
      ) ?? getDefaultVariant(selectedProduct))
    : null;
  const paymentQrUrl = resolveOracleImageUrl(booth.payment.qrImage);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-copy">
            <p className="brand-name">{booth.name}</p>
            <p className="brand-subtitle">
              {booth.event.name} · {booth.event.boothLabel}
            </p>
          </div>
        </div>
        <div className="top-actions">
          <a className="ghost-button top-info-button" href="#booth-info">
            Booth notes <span aria-hidden="true">↓</span>
          </a>
          <button
            type="button"
            className="ghost-button"
            onClick={openCart}
            aria-label={`Open bag with ${cartCount} items`}
          >
            Bag <span className="bag-count">{cartCount}</span>
          </button>
        </div>
      </header>

      <div className="page-content">
        <section className="hero-layout" aria-label="Booth highlights">
          <article className="spotlight">
            <div className="spotlight-copy">
              <div className="status-row">
                <p className="eyebrow">Featured small wonder</p>
                <span className="featured-count">
                  {String(featuredIndex + 1).padStart(2, "0")} /{" "}
                  {String(featuredProducts.length).padStart(2, "0")}
                </span>
              </div>
              <h1 className="hero-title">{featured.name}</h1>
              <p className="hero-description">{featured.shortDescription}</p>
              <div className="price-row">
                <p className="price">{formatPrice(featured.priceCents)}</p>
                <p className="stock">
                  {getDefaultVariant(featured).availability.label}
                </p>
              </div>
              <div className="spotlight-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    addToCart(featured, getDefaultVariant(featured))
                  }
                  disabled={
                    !getDefaultVariant(featured).availability.purchasable
                  }
                >
                  Add to bag
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => inspectProduct(featured)}
                >
                  See the details
                </button>
              </div>
              <div className="featured-controls">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    setFeaturedIndex(
                      (current) =>
                        (current - 1 + featuredProducts.length) %
                        featuredProducts.length,
                    )
                  }
                  aria-label="Previous featured product"
                >
                  ←
                </button>
                <div className="progress-dots" aria-label="Featured products">
                  {featuredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      type="button"
                      className="progress-dot"
                      aria-label={`Show ${product.name}`}
                      aria-current={index === featuredIndex}
                      onClick={() => setFeaturedIndex(index)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    setFeaturedIndex(
                      (current) => (current + 1) % featuredProducts.length,
                    )
                  }
                  aria-label="Next featured product"
                >
                  →
                </button>
              </div>
            </div>
            <div className="spotlight-art">
              <ProductArtwork product={featured} />
            </div>
          </article>

          <aside className="artist-card" id="booth-info">
            <div className="status-row">
              <span className="status-pill">{booth.event.statusLabel}</span>
              <span className="event-time">{booth.event.displayHours}</span>
            </div>
            <div className="identity-row">
              <span className="avatar" aria-hidden="true">
                LT
              </span>
              <div>
                <h2 className="artist-name">{booth.name}</h2>
                <p className="artist-handle">
                  by {booth.creator.name} · {booth.creator.pronouns}
                </p>
              </div>
            </div>
            <p className="artist-description">{booth.introduction}</p>
            <div className="info-list">
              <div className="info-item">
                <span className="info-icon" aria-hidden="true">
                  ◇
                </span>
                <span>
                  <span className="info-label">Find us</span>
                  <span className="info-value">
                    {booth.event.venue} · {booth.event.boothLabel}
                  </span>
                </span>
              </div>
              <div className="info-item">
                <span className="info-icon" aria-hidden="true">
                  ◷
                </span>
                <span>
                  <span className="info-label">Collection</span>
                  <span className="info-value">{booth.event.fulfillment}</span>
                </span>
              </div>
            </div>
            <nav className="social-links" aria-label="Creator links">
              {booth.creator.socials.map((social) => (
                <a
                  key={social.platform}
                  className="social-link"
                  href={social.href}
                >
                  {social.label}
                </a>
              ))}
            </nav>
          </aside>
        </section>

        <section className="info-strip" aria-label="Booth information">
          <div className="strip-item">
            <span className="strip-label">Weekend extra</span>
            <strong className="strip-value">{booth.announcement}</strong>
          </div>
          <div className="strip-item">
            <span className="strip-label">Made in</span>
            <strong className="strip-value">{booth.creator.location}</strong>
          </div>
          <div className="strip-item">
            <span className="strip-label">Payment</span>
            <strong className="strip-value">Manual bank transfer only</strong>
          </div>
        </section>

        <div className="catalogue-heading">
          <div>
            <p className="section-kicker">Browse the table</p>
            <h2 className="section-title">Pocket-sized treasures</h2>
          </div>
          <span className="result-count" aria-live="polite">
            {filteredProducts.length} of {products.length} pieces shown
          </span>
        </div>

        <div className="catalogue-layout">
          <section className="catalogue-panel" aria-label="Product catalogue">
            <div className="catalogue-toolbar">
              <div className="category-list" aria-label="Filter by category">
                <button
                  type="button"
                  className="category-button"
                  aria-pressed={category === "all"}
                  onClick={() => setCategory("all")}
                >
                  Everything
                </button>
                {categories.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="category-button"
                    aria-pressed={category === entry.id}
                    onClick={() => setCategory(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <div className="toolbar-actions">
                <label className="search-field">
                  <span className="sr-only">Search products</span>
                  <input
                    className="search-input"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search the table..."
                  />
                </label>
                <label>
                  <span className="sr-only">Sort products</span>
                  <select
                    className="sort-select"
                    value={sortMode}
                    onChange={(event) =>
                      setSortMode(event.target.value as SortMode)
                    }
                  >
                    <option value="featured">Featured first</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                    <option value="name">Name</option>
                  </select>
                </label>
                <div className="view-switch" aria-label="Catalogue layout">
                  <button
                    type="button"
                    className="view-button"
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    onClick={() => setViewMode("grid")}
                  >
                    ⊞
                  </button>
                  <button
                    type="button"
                    className="view-button"
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                  >
                    ≡
                  </button>
                </div>
              </div>
            </div>

            {filteredProducts.length > 0 ? (
              <div
                className={`product-grid ${viewMode === "list" ? "list-view" : ""}`}
              >
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onInspect={inspectProduct}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-results">
                <div>
                  <span className="empty-symbol" aria-hidden="true">
                    ?
                  </span>
                  <h3 className="empty-title">Nothing hiding here</h3>
                  <p className="muted">
                    Try another category or a shorter search phrase.
                  </p>
                  <button
                    type="button"
                    className="secondary-button reset-button"
                    onClick={() => {
                      setCategory("all");
                      setQuery("");
                    }}
                  >
                    Reset the table
                  </button>
                </div>
              </div>
            )}
          </section>

          {mobileCartOpen ? (
            <button
              type="button"
              className="mobile-cart-backdrop"
              onClick={() => setMobileCartOpen(false)}
              aria-label="Close bag"
            />
          ) : null}
          <aside
            className={`cart-panel ${mobileCartOpen ? "mobile-open" : ""}`}
            id="cart"
            aria-label="Shopping bag"
          >
            <div className="cart-head">
              <div>
                <p className="section-kicker">Your picks</p>
                <h2 className="cart-title">Bag · {cartCount}</h2>
              </div>
              <button
                type="button"
                className="icon-button sheet-close"
                onClick={() => setMobileCartOpen(false)}
                aria-label="Close bag"
              >
                ×
              </button>
            </div>

            {cartDetails.length === 0 ? (
              <EmptyCart />
            ) : (
              <>
                <div className="cart-items">
                  {cartDetails.map(({ line, product, variant }) => (
                    <article
                      className="cart-line"
                      key={`${line.productId}:${line.variantId}`}
                    >
                      <div className="cart-line-head">
                        <div>
                          <h3 className="cart-line-title">{product.name}</h3>
                          <p className="cart-line-price">
                            {variant.label} ·{" "}
                            {formatPrice(getVariantPrice(product, variant))}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="remove-button"
                          onClick={() => removeLine(line)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="quantity-row">
                        <div className="quantity-control">
                          <button
                            type="button"
                            className="quantity-button"
                            onClick={() => changeQuantity(line, -1)}
                            aria-label={`Decrease ${product.name} quantity`}
                          >
                            −
                          </button>
                          <span aria-label={`Quantity ${line.quantity}`}>
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            className="quantity-button"
                            onClick={() => changeQuantity(line, 1)}
                            aria-label={`Increase ${product.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                        <span className="line-total">
                          {formatPrice(
                            getVariantPrice(product, variant) * line.quantity,
                          )}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="cart-summary">
                  <div className="cart-summary-row">
                    <span>Items</span>
                    <strong>{cartCount}</strong>
                  </div>
                  <div className="cart-summary-row">
                    <span>Collection</span>
                    <strong>Arranged manually</strong>
                  </div>
                  <div className="cart-summary-row total">
                    <span>Total</span>
                    <strong>{formatPrice(cartTotal)}</strong>
                  </div>
                  <button
                    type="button"
                    className="primary-button cart-checkout"
                    onClick={() => setPaymentOpen(true)}
                  >
                    View bank-transfer details
                  </button>
                  <p className="manual-note">
                    No payment is processed here. Transfers are confirmed by the
                    creator manually.
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>

        <footer className="footer-row">
          <span className="footer-mark">Cyfurden · made for little booths</span>
          <p className="footer-note">
            Original demo content · Oracle Object Storage ready · No payment
            gateway
          </p>
        </footer>
      </div>

      {selectedProduct && selectedVariant ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedProduct(null);
          }}
        >
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-dialog-title"
          >
            <button
              type="button"
              className="icon-button modal-close"
              onClick={() => setSelectedProduct(null)}
              aria-label="Close product details"
            >
              ×
            </button>
            <ProductArtwork product={selectedProduct} />
            <div className="modal-copy">
              <p className="eyebrow">{selectedProduct.eyebrow}</p>
              <h2 className="modal-title" id="product-dialog-title">
                {selectedProduct.name}
              </h2>
              <p className="modal-description">{selectedProduct.description}</p>
              {selectedProduct.variants.length > 1 ? (
                <div className="variant-list" aria-label="Choose an option">
                  {selectedProduct.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      className="variant-pill"
                      data-selected={variant.id === selectedVariant.id}
                      onClick={() => setSelectedVariantId(variant.id)}
                    >
                      {variant.label} · {variant.availability.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="muted">
                {selectedVariant.availability.fulfillmentNote}
              </p>
              <div className="modal-price-row">
                <span className="modal-price">
                  {formatPrice(
                    getVariantPrice(selectedProduct, selectedVariant),
                  )}
                </span>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedVariant.availability.purchasable}
                  onClick={() => {
                    addToCart(selectedProduct, selectedVariant);
                    setSelectedProduct(null);
                  }}
                >
                  {selectedVariant.availability.purchasable
                    ? "Add to bag"
                    : "Currently sold out"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {paymentOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPaymentOpen(false);
          }}
        >
          <section
            className="payment-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-dialog-title"
          >
            <div className="payment-header">
              <div>
                <p className="eyebrow">Manual payment handoff</p>
                <h2 className="payment-title" id="payment-dialog-title">
                  Transfer when you are ready
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPaymentOpen(false)}
                aria-label="Close bank-transfer details"
              >
                ×
              </button>
            </div>
            <div className="payment-grid">
              <div className="qr-frame">
                {paymentQrUrl ? (
                  <span
                    className="remote-art"
                    style={{ backgroundImage: `url("${paymentQrUrl}")` }}
                    role="img"
                    aria-label={booth.payment.qrImage.alt}
                  />
                ) : (
                  <span className="qr-placeholder">
                    The booth owner’s uploaded bank QR will appear here after
                    Oracle Object Storage is configured.
                  </span>
                )}
              </div>
              <div className="payment-details">
                {[
                  ["bank", "Bank", booth.payment.bankName],
                  ["account-name", "Account name", booth.payment.accountName],
                  [
                    "account-number",
                    "Account number",
                    booth.payment.accountNumber,
                  ],
                  ["reference", "Transfer reference", transferReference],
                  ["total", "Exact total", formatPrice(cartTotal)],
                ].map(([field, label, value]) => (
                  <div className="payment-field" key={field}>
                    <span className="payment-label">
                      {label}
                      <button
                        type="button"
                        className="copy-button"
                        onClick={() => copyText(field, value)}
                      >
                        {copiedField === field ? "Copied" : "Copy"}
                      </button>
                    </span>
                    <strong className="payment-value">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <p className="payment-note">
              {booth.payment.instructions} {booth.payment.disclaimer} This is
              demonstration banking information; do not send real funds.
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
