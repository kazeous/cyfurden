import Link from "next/link";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  hideProductAction,
  saveProductAction,
  savePromotionAction,
} from "../actions";

const productStatuses = ["DRAFT", "LIVE", "SOLD_OUT", "HIDDEN"] as const;
const variantStatuses = [
  "AVAILABLE",
  "LOW_STOCK",
  "PREORDER",
  "SOLD_OUT",
  "HIDDEN",
] as const;

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
  const { membership } = await requireBoothMember(boothId);
  const canEdit = membership.role === "OWNER" || membership.role === "ADMIN";
  const status = productStatuses.includes(
    filters.status as (typeof productStatuses)[number],
  )
    ? (filters.status as (typeof productStatuses)[number])
    : undefined;
  const query = filters.query?.trim() ?? "";

  const [products, counts, promotion] = await Promise.all([
    db.product.findMany({
      where: {
        boothId,
        ...(status ? { status } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { sku: { contains: query, mode: "insensitive" } },
                { tags: { has: query.toLocaleLowerCase() } },
              ],
            }
          : {}),
      },
      include: {
        variants: { orderBy: { sortOrder: "asc" } },
        images: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    db.product.groupBy({
      by: ["status"],
      where: { boothId },
      _count: true,
    }),
    db.quantityPromotion.findFirst({ where: { boothId } }),
  ]);
  const selected = filters.new
    ? null
    : (products.find((product) => product.id === filters.product) ??
      products[0] ??
      null);
  const variant = selected?.variants[0] ?? null;
  const countMap = new Map(counts.map((entry) => [entry.status, entry._count]));
  const total = counts.reduce((sum, entry) => sum + entry._count, 0);
  const needsAttention =
    (countMap.get("DRAFT") ?? 0) + (countMap.get("SOLD_OUT") ?? 0);

  return (
    <>
      <PageHeading
        eyebrow="Catalogue management"
        title="Products"
        description="Manage listings, pricing, stock signals, and Oracle-hosted images."
        actions={
          <>
            <span className={styles.pill}>{total} total</span>
            <span className={styles.pill}>{needsAttention} need attention</span>
            <span className={styles.pill}>
              {countMap.get("HIDDEN") ?? 0} hidden
            </span>
          </>
        }
      />

      {filters.saved ? <p className={styles.notice}>Product saved.</p> : null}
      {!canEdit ? (
        <p className={styles.notice}>
          Staff access is read-only for catalogue management.
        </p>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Quantity promotion</h2>
            <p>
              Configure a simple mix-and-match offer. It is inactive by default.
            </p>
          </div>
          <span
            className={styles.statusBadge}
            data-status={promotion?.active ? "ACTIVE" : "DRAFT"}
          >
            {promotion?.active ? "active" : "inactive"}
          </span>
        </div>
        <form action={savePromotionAction} className={styles.formGridThree}>
          <input type="hidden" name="boothId" value={boothId} />
          <input type="hidden" name="promotionId" value={promotion?.id ?? ""} />
          <label className={styles.field}>
            Offer name
            <input
              name="name"
              defaultValue={promotion?.name ?? "Buy 3, get 1 free"}
            />
          </label>
          <label className={styles.field}>
            Buy quantity
            <input
              name="buyQuantity"
              type="number"
              min="1"
              max="99"
              defaultValue={promotion?.buyQuantity ?? 3}
            />
          </label>
          <label className={styles.field}>
            Reward quantity
            <input
              name="rewardQuantity"
              type="number"
              min="1"
              max="99"
              defaultValue={promotion?.rewardQuantity ?? 1}
            />
          </label>
          <label className={styles.checkboxField}>
            <input
              name="repeatable"
              type="checkbox"
              defaultChecked={promotion?.repeatable ?? true}
            />
            Repeat the offer
          </label>
          <label className={styles.checkboxField}>
            <input
              name="active"
              type="checkbox"
              defaultChecked={promotion?.active ?? false}
            />
            Promotion active
          </label>
          {canEdit ? (
            <SubmitButton className={styles.button} pendingLabel="Saving…">
              Save promotion
            </SubmitButton>
          ) : null}
        </form>
      </section>

      <div className={styles.splitLayout} style={{ marginTop: 18 }}>
        <aside className={styles.listPane}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Products</h2>
              <p>{products.length} matching items</p>
            </div>
            {canEdit ? (
              <Link
                className={styles.buttonPrimary}
                href={`/manage/${boothId}/products?new=1`}
              >
                + New item
              </Link>
            ) : null}
          </div>

          <form
            className={styles.stack}
            action={`/manage/${boothId}/products`}
            method="get"
          >
            <input
              className={styles.searchInput}
              type="search"
              name="query"
              defaultValue={query}
              placeholder="Search products"
              aria-label="Search products"
            />
            <div className={styles.filterRow}>
              <Link className={styles.tab} href={`/manage/${boothId}/products`}>
                All
              </Link>
              {productStatuses.map((entry) => (
                <Link
                  className={styles.tab}
                  key={entry}
                  href={`/manage/${boothId}/products?status=${entry}`}
                >
                  {entry.toLocaleLowerCase()}
                </Link>
              ))}
            </div>
          </form>

          {products.length ? (
            <ul className={styles.itemList} style={{ marginTop: 16 }}>
              {products.map((product) => (
                <li key={product.id}>
                  <Link
                    className={styles.listItem}
                    href={`/manage/${boothId}/products?product=${product.id}`}
                  >
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {product.sku ?? "No SKU"} ·{" "}
                        {(Number(product.priceCents) / 100).toLocaleString(
                          "vi-VN",
                        )}{" "}
                        ₫
                      </small>
                    </span>
                    <span
                      className={styles.statusBadge}
                      data-status={product.status}
                    >
                      {product.status.toLocaleLowerCase()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <div>
                <span className={styles.emptyIcon} aria-hidden="true">
                  ◇
                </span>
                <h3>No products yet</h3>
                <p>Create the first listing to begin filling this booth.</p>
              </div>
            </div>
          )}
        </aside>

        <section className={styles.editorPane}>
          {selected || filters.new ? (
            <form action={saveProductAction} className={styles.stack}>
              <input type="hidden" name="boothId" value={boothId} />
              <input
                type="hidden"
                name="productId"
                value={selected?.id ?? ""}
              />
              <input type="hidden" name="variantId" value={variant?.id ?? ""} />
              <div className={styles.panelHeader}>
                <div>
                  <h2>
                    {selected ? `Editing ${selected.name}` : "Create product"}
                  </h2>
                  <p>
                    Prices use Vietnamese đồng; database values remain integer
                    minor units.
                  </p>
                </div>
                {selected ? (
                  <span
                    className={styles.statusBadge}
                    data-status={selected.status}
                  >
                    {selected.status.toLocaleLowerCase()}
                  </span>
                ) : null}
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  Product name
                  <input
                    name="name"
                    defaultValue={selected?.name ?? ""}
                    required
                  />
                </label>
                <label className={styles.field}>
                  URL slug
                  <input
                    name="slug"
                    defaultValue={selected?.slug ?? ""}
                    placeholder="generated-from-name"
                  />
                </label>
                <label className={styles.field}>
                  SKU
                  <input
                    name="sku"
                    defaultValue={selected?.sku ?? variant?.sku ?? ""}
                    required
                  />
                </label>
                <label className={styles.field}>
                  Price (VND)
                  <input
                    name="priceVnd"
                    type="number"
                    min="0"
                    step="1000"
                    max="9000000000000"
                    defaultValue={
                      selected ? Number(selected.priceCents) / 100 : 0
                    }
                    required
                  />
                </label>
                <label className={styles.field}>
                  Product status
                  <select
                    name="status"
                    defaultValue={selected?.status ?? "DRAFT"}
                  >
                    {productStatuses.map((entry) => (
                      <option value={entry} key={entry}>
                        {entry.toLocaleLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Variant status
                  <select
                    name="variantStatus"
                    defaultValue={variant?.status ?? "AVAILABLE"}
                  >
                    {variantStatuses.map((entry) => (
                      <option value={entry} key={entry}>
                        {entry.toLocaleLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Variant label
                  <input
                    name="variantLabel"
                    defaultValue={variant?.label ?? "Standard"}
                  />
                </label>
                <label className={styles.field}>
                  Stock quantity
                  <input
                    name="stockQuantity"
                    type="number"
                    min="0"
                    defaultValue={variant?.stockQuantity ?? ""}
                    placeholder="Untracked"
                  />
                </label>
              </div>
              <label className={styles.field}>
                Eyebrow
                <input name="eyebrow" defaultValue={selected?.eyebrow ?? ""} />
              </label>
              <label className={styles.field}>
                Short description
                <input
                  name="shortDescription"
                  defaultValue={selected?.shortDescription ?? ""}
                />
              </label>
              <label className={styles.field}>
                Full description
                <textarea
                  name="description"
                  defaultValue={selected?.description ?? ""}
                  required
                />
              </label>
              <label className={styles.field}>
                Tags
                <input
                  name="tags"
                  defaultValue={selected?.tags.join(", ") ?? ""}
                />
                <small>Comma-separated, up to twelve tags.</small>
              </label>
              <label className={styles.field}>
                Fulfilment note
                <input
                  name="fulfillmentNote"
                  defaultValue={variant?.fulfillmentNote ?? ""}
                />
              </label>
              <label className={styles.field}>
                Oracle image object key
                <input
                  name="imageObjectKey"
                  defaultValue={selected?.images[0]?.objectKey ?? ""}
                />
                <small>
                  Example: booths/{boothId}/products/item/front.webp
                </small>
              </label>
              <label className={styles.field}>
                Image alt text
                <input
                  name="imageAlt"
                  defaultValue={
                    selected?.images[0]?.alt ?? selected?.name ?? ""
                  }
                />
              </label>
              <label className={styles.checkboxField}>
                <input
                  name="featured"
                  type="checkbox"
                  defaultChecked={selected?.featured ?? false}
                />
                Feature this item on the storefront
              </label>
              {canEdit ? (
                <div className={styles.buttonRow}>
                  <SubmitButton
                    className={styles.buttonPrimary}
                    pendingLabel="Saving product…"
                  >
                    Save product
                  </SubmitButton>
                </div>
              ) : null}
            </form>
          ) : (
            <div className={styles.emptyState}>
              <div>
                <span className={styles.emptyIcon} aria-hidden="true">
                  ◇
                </span>
                <h2>No product selected</h2>
                <p>Choose a listing from the left, or start a new one.</p>
                {canEdit ? (
                  <Link
                    className={styles.buttonPrimary}
                    href={`/manage/${boothId}/products?new=1`}
                  >
                    Create product
                  </Link>
                ) : null}
              </div>
            </div>
          )}

          {selected && canEdit ? (
            <form action={hideProductAction} style={{ marginTop: 18 }}>
              <input type="hidden" name="boothId" value={boothId} />
              <input type="hidden" name="productId" value={selected.id} />
              <SubmitButton
                className={styles.buttonDanger}
                pendingLabel="Hiding…"
              >
                Hide product
              </SubmitButton>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
