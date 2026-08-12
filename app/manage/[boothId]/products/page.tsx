import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeading } from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { parseBilingual, type Locale } from "@/lib/i18n";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { db } from "@/lib/db";
import { productAttentionWhere } from "@/lib/product-inventory";
import { defaultProductVariantLabel } from "@/lib/system-content";
import { ProductForm, type ProductEditorValue } from "./product-form";
import styles from "./products.module.css";

const productStatuses = ["DRAFT", "LIVE", "SOLD_OUT", "HIDDEN"] as const;
const productFilterIds = [...productStatuses, "ATTENTION"] as const;
type ProductStatus = (typeof productStatuses)[number];
type ProductFilter = (typeof productFilterIds)[number];
type VariantStatus =
  | "AVAILABLE"
  | "LOW_STOCK"
  | "PREORDER"
  | "SOLD_OUT"
  | "HIDDEN";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).products;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

function formatMoney(priceCents: bigint, locale: Locale) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(priceCents / BigInt(100));
}

function productHref(
  boothId: string,
  options: {
    product?: string;
    newProduct?: boolean;
    query?: string;
    status?: string;
  },
) {
  const params = new URLSearchParams();
  if (options.product) params.set("product", options.product);
  if (options.newProduct) params.set("new", "1");
  if (options.query) params.set("query", options.query);
  if (options.status) params.set("status", options.status);
  const query = params.toString();
  return `/manage/${boothId}/products${query ? `?${query}` : ""}`;
}

function normalizeEditorValue(
  product: {
    id: string;
    name: string;
    slug: string;
    sku: string | null;
    priceCents: bigint;
    status: ProductStatus;
    eyebrow: string | null;
    shortDescription: string | null;
    description: string;
    tags: string[];
    featured: boolean;
    variants: Array<{
      id: string;
      sku: string;
      label: string;
      priceCents: bigint | null;
      status: VariantStatus;
      stockQuantity: number | null;
      fulfillmentNote: string | null;
      _count: { orderItems: number; gachaPoolItems: number };
    }>;
    images: Array<{ id: string; objectKey: string; alt: string }>;
  } | null,
): ProductEditorValue {
  const variants = product?.variants.length
    ? product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label: variant.label,
        priceVnd:
          variant.priceCents === null ? null : Number(variant.priceCents) / 100,
        status: variant.status,
        stockQuantity: variant.stockQuantity,
        fulfillmentNote: variant.fulfillmentNote ?? "",
        referenced:
          variant._count.orderItems > 0 || variant._count.gachaPoolItems > 0,
      }))
    : [
        {
          id: null,
          sku: "",
          label: defaultProductVariantLabel,
          priceVnd: null,
          status: "AVAILABLE" as const,
          stockQuantity: null,
          fulfillmentNote: "",
          referenced: false,
        },
      ];
  return {
    id: product?.id ?? null,
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    sku: product?.sku ?? "",
    priceVnd: product ? Number(product.priceCents) / 100 : 0,
    status: product?.status ?? "DRAFT",
    eyebrow: product?.eyebrow ?? "",
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    tags: product?.tags.join(", ") ?? "",
    featured: product?.featured ?? false,
    variants,
    images:
      product?.images.map((image) => ({
        id: image.id,
        url: resolveOracleImageUrl(image) ?? null,
        alt: image.alt,
      })) ?? [],
  };
}

function productInventorySummary(
  variants: Array<{
    status: VariantStatus;
    stockQuantity: number | null;
  }>,
  untracked: string,
) {
  const visible = variants.filter((variant) => variant.status !== "HIDDEN");
  if (visible.some((variant) => variant.stockQuantity === null)) {
    return untracked;
  }
  return visible.reduce(
    (total, variant) => total + (variant.stockQuantity ?? 0),
    0,
  );
}

function ProductThumbnail({
  objectKey,
  alt,
  name,
}: {
  objectKey?: string;
  alt?: string;
  name: string;
}) {
  const src = objectKey ? resolveOracleImageUrl({ objectKey }) : undefined;
  return src ? (
    <Image
      className={styles.thumb}
      src={src}
      alt={alt || name}
      width={42}
      height={42}
      unoptimized
    />
  ) : (
    <span className={styles.thumbFallback} aria-hidden="true">
      {name.slice(0, 1).toUpperCase() || "P"}
    </span>
  );
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{
    product?: string;
    query?: string;
    status?: string;
    new?: string;
    saved?: string;
  }>;
}) {
  const { boothId } = await params;
  const filters = await searchParams;
  const [, locale] = await Promise.all([
    requireBoothSection(boothId, "products"),
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.products;
  const common = workspaceStrings.common;
  const productFilterOptions = [
    { id: "LIVE", label: strings.filterLive },
    { id: "ATTENTION", label: strings.filterAttention },
    { id: "HIDDEN", label: strings.filterHidden },
  ] as const;
  const canEdit = true;
  const activeFilter = productFilterIds.includes(
    filters.status as ProductFilter,
  )
    ? (filters.status as ProductFilter)
    : undefined;
  const query = filters.query?.trim() ?? "";
  const products = await db.product.findMany({
    where: {
      boothId,
      AND: [
        ...(activeFilter === "ATTENTION"
          ? [productAttentionWhere]
          : activeFilter
            ? [{ status: activeFilter }]
            : []),
        ...(query
          ? [
              {
                OR: [
                  { name: { contains: query, mode: "insensitive" as const } },
                  { sku: { contains: query, mode: "insensitive" as const } },
                  {
                    variants: {
                      some: {
                        sku: { contains: query, mode: "insensitive" as const },
                      },
                    },
                  },
                  { tags: { has: query.toLocaleLowerCase() } },
                ],
              },
            ]
          : []),
      ],
    },
    include: {
      variants: {
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { orderItems: true, gachaPoolItems: true } },
        },
      },
      images: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  const [counts, attentionCount, requestedProduct] = await Promise.all([
    db.product.groupBy({
      by: ["status"],
      where: { boothId },
      _count: true,
    }),
    db.product.count({ where: { boothId, ...productAttentionWhere } }),
    filters.product
      ? db.product.findFirst({
          where: { id: filters.product, boothId },
          include: {
            variants: {
              orderBy: { sortOrder: "asc" },
              include: {
                _count: { select: { orderItems: true, gachaPoolItems: true } },
              },
            },
            images: { orderBy: { sortOrder: "asc" } },
          },
        })
      : Promise.resolve(null),
  ]);
  const selectedFromResults = filters.product
    ? (products.find((product) => product.id === filters.product) ?? null)
    : null;
  const selected = selectedFromResults ?? requestedProduct;
  const staleSelection = Boolean(
    filters.product && requestedProduct && !selectedFromResults,
  );
  const isCreating = filters.new === "1";
  const countMap = new Map(counts.map((entry) => [entry.status, entry._count]));
  const total = counts.reduce((sum, entry) => sum + entry._count, 0);
  const hidden = countMap.get("HIDDEN") ?? 0;
  const attention = attentionCount;
  const cancelHref = productHref(boothId, {
    query,
    status: activeFilter,
  });

  return (
    <div className={styles.page}>
      <PageHeading
        eyebrow={strings.eyebrow}
        title={strings.title}
        description={strings.description}
        actions={
          total > 0 ? (
            <div
              className={styles.headerSummary}
              aria-label={strings.summaryAria}
            >
              <span>{strings.totalCount(total)}</span>
              <span>{strings.attentionCount(attention)}</span>
              <span>{strings.hiddenCount(hidden)}</span>
            </div>
          ) : undefined
        }
      />

      {filters.saved ? (
        <p className={styles.notice} role="status">
          {strings.savedNotice}
        </p>
      ) : null}
      {!canEdit ? (
        <p className={styles.notice} role="status">
          {strings.readOnlyNotice}
        </p>
      ) : null}

      <section
        className={styles.indexPanel}
        aria-labelledby="product-index-heading"
      >
        <div className={styles.toolbar}>
          <form className={styles.searchForm} method="get">
            <label className={styles.srOnly} htmlFor="product-search">
              {strings.searchLabel}
            </label>
            <input
              id="product-search"
              className={styles.searchInput}
              type="search"
              name="query"
              defaultValue={query}
              placeholder={strings.searchPlaceholder}
            />
            {activeFilter ? (
              <input type="hidden" name="status" value={activeFilter} />
            ) : null}
            <button className={styles.clearButton} type="submit">
              {strings.search}
            </button>
          </form>
          <Link
            className={styles.newButton}
            href={productHref(boothId, { newProduct: true })}
          >
            {strings.newProduct}
          </Link>
        </div>
        <div className={styles.filterLinks} aria-label={strings.filtersAria}>
          <Link
            className={styles.filterLink}
            href={productHref(boothId, { query })}
            aria-current={!activeFilter ? "page" : undefined}
          >
            {strings.filterAll} {total}
          </Link>
          {productFilterOptions.map((entry) => (
            <Link
              className={styles.filterLink}
              href={productHref(boothId, { query, status: entry.id })}
              aria-current={activeFilter === entry.id ? "page" : undefined}
              key={entry.id}
            >
              {entry.label}{" "}
              {entry.id === "ATTENTION"
                ? attention
                : (countMap.get(entry.id) ?? 0)}
            </Link>
          ))}
        </div>

        <h2 id="product-index-heading" className={styles.srOnly}>
          {strings.catalogueHeading}
        </h2>
        {products.length ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{strings.productColumn}</th>
                    <th scope="col">{strings.statusColumn}</th>
                    <th scope="col">{strings.priceColumn}</th>
                    <th scope="col">{strings.stockColumn}</th>
                    <th scope="col">
                      <span className={styles.srOnly}>
                        {strings.actionColumn}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    return (
                      <tr className={styles.row} key={product.id}>
                        <td>
                          <Link
                            className={styles.productLink}
                            href={productHref(boothId, {
                              product: product.id,
                              query,
                              status: activeFilter,
                            })}
                          >
                            <ProductThumbnail
                              objectKey={product.images[0]?.objectKey}
                              alt={product.images[0]?.alt}
                              name={parseBilingual(product.name, locale)}
                            />
                            <span className={styles.productCopy}>
                              <strong>
                                {parseBilingual(product.name, locale)}
                              </strong>
                              <small>{product.sku || common.noSku}</small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span
                            className={styles.status}
                            data-status={product.status}
                          >
                            {common.productStatusLabels[product.status] ??
                              product.status}
                          </span>
                        </td>
                        <td className={styles.price}>
                          {formatMoney(product.priceCents, locale)}
                        </td>
                        <td className={styles.muted}>
                          {productInventorySummary(
                            product.variants,
                            common.untracked,
                          )}
                          {product.variants.length > 1 ? (
                            <small className={styles.variantCount}>
                              {strings.variantCount(product.variants.length)}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <Link
                            className={styles.clearButton}
                            href={productHref(boothId, {
                              product: product.id,
                              query,
                              status: activeFilter,
                            })}
                          >
                            {strings.edit}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>
              {products.map((product) => {
                const href = productHref(boothId, {
                  product: product.id,
                  query,
                  status: activeFilter,
                });
                return (
                  <Link className={styles.card} href={href} key={product.id}>
                    <div className={styles.cardTop}>
                      <span className={styles.productLink}>
                        <ProductThumbnail
                          objectKey={product.images[0]?.objectKey}
                          alt={product.images[0]?.alt}
                          name={parseBilingual(product.name, locale)}
                        />
                        <span className={styles.productCopy}>
                          <strong>
                            {parseBilingual(product.name, locale)}
                          </strong>
                          <small>{product.sku || common.noSku}</small>
                        </span>
                      </span>
                      <span
                        className={styles.status}
                        data-status={product.status}
                      >
                        {common.productStatusLabels[product.status] ??
                          product.status}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span>{formatMoney(product.priceCents, locale)}</span>
                      <span>
                        {strings.inStock(
                          productInventorySummary(
                            product.variants,
                            common.untracked,
                          ),
                        )}
                        {product.variants.length > 1
                          ? ` · ${strings.variantCount(product.variants.length)}`
                          : ""}
                      </span>
                    </div>
                    <div className={styles.cardActions}>
                      <span className={styles.clearButton}>
                        {strings.editProduct}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <div>
              <h2>
                {query || activeFilter
                  ? strings.noMatchingTitle
                  : strings.noProductsTitle}
              </h2>
              <p>
                {query || activeFilter
                  ? strings.noMatchingBody
                  : strings.noProductsBody}
              </p>
              {query || activeFilter ? (
                <Link
                  className={styles.clearButton}
                  href={productHref(boothId, {})}
                >
                  {strings.clearFilters}
                </Link>
              ) : canEdit ? (
                <Link
                  className={styles.newButton}
                  href={productHref(boothId, { newProduct: true })}
                >
                  {strings.createProduct}
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {staleSelection ? (
        <p className={styles.staleNotice} role="status">
          {strings.staleSelection}
          <Link
            href={productHref(boothId, {
              query,
              status: activeFilter,
            })}
          >
            {strings.clearSelection}
          </Link>
        </p>
      ) : null}

      {isCreating || selected ? (
        <ProductForm
          key={selected?.id ?? "new"}
          boothId={boothId}
          locale={locale}
          value={normalizeEditorValue(selected)}
          canEdit={canEdit}
          cancelHref={cancelHref}
        />
      ) : null}
    </div>
  );
}
