import Image from "next/image";
import Link from "next/link";
import { PageHeading } from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { db } from "@/lib/db";
import { productAttentionWhere } from "@/lib/product-inventory";
import { ProductForm, type ProductEditorValue } from "./product-form";
import styles from "./products.module.css";

const productStatuses = ["DRAFT", "LIVE", "SOLD_OUT", "HIDDEN"] as const;
const productFilterIds = [...productStatuses, "ATTENTION"] as const;
const productFilterOptions = [
  { id: "LIVE", label: "Live" },
  { id: "ATTENTION", label: "Low / sold out" },
  { id: "HIDDEN", label: "Hidden" },
] as const;

type ProductStatus = (typeof productStatuses)[number];
type ProductFilter = (typeof productFilterIds)[number];
type VariantStatus =
  | "AVAILABLE"
  | "LOW_STOCK"
  | "PREORDER"
  | "SOLD_OUT"
  | "HIDDEN";

function displayStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
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
    }>;
    images: Array<{ id: string; objectKey: string; alt: string }>;
  } | null,
): ProductEditorValue {
  const variant = product?.variants[0] ?? null;
  return {
    id: product?.id ?? null,
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    sku: product?.sku ?? variant?.sku ?? "",
    priceVnd: product ? Number(product.priceCents) / 100 : 0,
    status: product?.status ?? "DRAFT",
    eyebrow: product?.eyebrow ?? "",
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    tags: product?.tags.join(", ") ?? "",
    featured: product?.featured ?? false,
    variantId: variant?.id ?? null,
    variantStatus: variant?.status ?? "AVAILABLE",
    variantLabel: variant?.label ?? "Standard",
    stockQuantity: variant?.stockQuantity ?? null,
    fulfillmentNote: variant?.fulfillmentNote ?? "",
    images:
      product?.images.map((image) => ({
        id: image.id,
        url: resolveOracleImageUrl(image) ?? null,
        alt: image.alt,
      })) ?? [],
  };
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
  await requireBoothSection(boothId, "products");
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
                  { tags: { has: query.toLocaleLowerCase() } },
                ],
              },
            ]
          : []),
      ],
    },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
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
            variants: { orderBy: { sortOrder: "asc" } },
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
        eyebrow="Catalogue management"
        title="Products"
        description="Keep listings, stock signals, and public images ready for visitors."
        actions={
          total > 0 ? (
            <div
              className={styles.headerSummary}
              aria-label="Catalogue summary"
            >
              <span>
                <strong>{total}</strong> total
              </span>
              <span>
                <strong>{attention}</strong> need attention
              </span>
              <span>
                <strong>{hidden}</strong> hidden
              </span>
            </div>
          ) : undefined
        }
      />

      {filters.saved ? (
        <p className={styles.notice} role="status">
          Product saved. The public storefront updates when its status is Live
          and the booth has been published.
        </p>
      ) : null}
      {!canEdit ? (
        <p className={styles.notice} role="status">
          You have read-only access. Ask an owner or admin to change catalogue
          data.
        </p>
      ) : null}

      <section
        className={styles.indexPanel}
        aria-labelledby="product-index-heading"
      >
        <div className={styles.toolbar}>
          <form className={styles.searchForm} method="get">
            <label className={styles.srOnly} htmlFor="product-search">
              Search products
            </label>
            <input
              id="product-search"
              className={styles.searchInput}
              type="search"
              name="query"
              defaultValue={query}
              placeholder="Search by name, SKU, or tag"
            />
            {activeFilter ? (
              <input type="hidden" name="status" value={activeFilter} />
            ) : null}
            <button className={styles.clearButton} type="submit">
              Search
            </button>
          </form>
          <Link
            className={styles.newButton}
            href={productHref(boothId, { newProduct: true })}
          >
            New product
          </Link>
        </div>
        <div className={styles.filterLinks} aria-label="Product status filters">
          <Link
            className={styles.filterLink}
            href={productHref(boothId, { query })}
            aria-current={!activeFilter ? "page" : undefined}
          >
            All {total}
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
          Product catalogue
        </h2>
        {products.length ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Status</th>
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col">
                      <span className={styles.srOnly}>Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const variant = product.variants[0];
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
                              name={product.name}
                            />
                            <span className={styles.productCopy}>
                              <strong>{product.name}</strong>
                              <small>{product.sku || "No SKU"}</small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span
                            className={styles.status}
                            data-status={product.status}
                          >
                            {displayStatus(product.status)}
                          </span>
                        </td>
                        <td className={styles.price}>
                          {(Number(product.priceCents) / 100).toLocaleString(
                            "vi-VN",
                          )}{" "}
                          ₫
                        </td>
                        <td className={styles.muted}>
                          {variant?.stockQuantity ?? "Untracked"}
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
                            Edit
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
                const variant = product.variants[0];
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
                          name={product.name}
                        />
                        <span className={styles.productCopy}>
                          <strong>{product.name}</strong>
                          <small>{product.sku || "No SKU"}</small>
                        </span>
                      </span>
                      <span
                        className={styles.status}
                        data-status={product.status}
                      >
                        {displayStatus(product.status)}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span>
                        {(Number(product.priceCents) / 100).toLocaleString(
                          "vi-VN",
                        )}{" "}
                        ₫
                      </span>
                      <span>
                        {variant?.stockQuantity ?? "Untracked"} in stock
                      </span>
                    </div>
                    <div className={styles.cardActions}>
                      <span className={styles.clearButton}>Edit product</span>
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
                  ? "No matching products"
                  : "No products yet"}
              </h2>
              <p>
                {query || activeFilter
                  ? "Try a different search or clear the current filter."
                  : "Create the first listing to start building this booth catalogue."}
              </p>
              {query || activeFilter ? (
                <Link
                  className={styles.clearButton}
                  href={productHref(boothId, {})}
                >
                  Clear filters
                </Link>
              ) : canEdit ? (
                <Link
                  className={styles.newButton}
                  href={productHref(boothId, { newProduct: true })}
                >
                  Create product
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {staleSelection ? (
        <p className={styles.staleNotice} role="status">
          This product is outside the current filter, so it remains selected
          while you edit it.
          <Link
            href={productHref(boothId, {
              query,
              status: activeFilter,
            })}
          >
            Clear selection
          </Link>
        </p>
      ) : null}

      {isCreating || selected ? (
        <ProductForm
          key={selected?.id ?? "new"}
          boothId={boothId}
          value={normalizeEditorValue(selected)}
          canEdit={canEdit}
          cancelHref={cancelHref}
        />
      ) : null}
    </div>
  );
}
