export type CatalogueSort =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "name";

export type CatalogueProduct = {
  name: string;
  eyebrow: string | null;
  shortDescription: string | null;
  tags: string[];
  featured: boolean;
  priceCents: string;
  createdAt: string;
  sortOrder: number;
  categorySlug: string | null;
};

type CatalogueOptions = {
  query?: string;
  categorySlug?: string;
  sort?: CatalogueSort;
};

const normalized = (value: string | null | undefined) =>
  value?.trim().toLocaleLowerCase() ?? "";

const compareName = (left: CatalogueProduct, right: CatalogueProduct) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: "base" });

export function filterAndSortCatalogue<T extends CatalogueProduct>(
  products: T[],
  {
    query = "",
    categorySlug = "all",
    sort = "featured",
  }: CatalogueOptions = {},
) {
  const search = normalized(query);
  const visible = products.filter((product) => {
    if (categorySlug !== "all" && product.categorySlug !== categorySlug) {
      return false;
    }
    if (!search) return true;
    return [
      product.name,
      product.eyebrow,
      product.shortDescription,
      ...product.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(search);
  });

  return [...visible].sort((left, right) => {
    if (sort === "price-asc" || sort === "price-desc") {
      const priceComparison =
        BigInt(left.priceCents) < BigInt(right.priceCents)
          ? -1
          : BigInt(left.priceCents) > BigInt(right.priceCents)
            ? 1
            : 0;
      if (priceComparison) {
        return sort === "price-asc" ? priceComparison : -priceComparison;
      }
    }
    if (sort === "name") return compareName(left, right);
    if (sort === "newest") {
      const dateComparison = right.createdAt.localeCompare(left.createdAt);
      if (dateComparison) return dateComparison;
    }
    if (sort === "featured" && left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }
    const orderComparison = left.sortOrder - right.sortOrder;
    return orderComparison || compareName(left, right);
  });
}
