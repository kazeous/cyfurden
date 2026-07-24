import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortCatalogue } from "../lib/catalogue";

const products = [
  {
    name: "Moon Pin",
    eyebrow: "Enamel",
    shortDescription: "A small silver pin",
    tags: ["accessory", "night"],
    featured: false,
    priceCents: "24000",
    createdAt: "2026-07-10T00:00:00.000Z",
    sortOrder: 2,
    categorySlug: "pins",
  },
  {
    name: "Sun Print",
    eyebrow: "Paper",
    shortDescription: "Warm risograph colours",
    tags: ["print", "day"],
    featured: true,
    priceCents: "12000",
    createdAt: "2026-07-20T00:00:00.000Z",
    sortOrder: 1,
    categorySlug: "prints",
  },
  {
    name: "Cloud Charm",
    eyebrow: null,
    shortDescription: null,
    tags: ["accessory"],
    featured: false,
    priceCents: "18000",
    createdAt: "2026-07-21T00:00:00.000Z",
    sortOrder: 3,
    categorySlug: "charms",
  },
];

test("catalogue search and category filtering compose", () => {
  assert.deepEqual(
    filterAndSortCatalogue(products, {
      query: "night",
      categorySlug: "pins",
    }).map((product) => product.name),
    ["Moon Pin"],
  );
  assert.deepEqual(
    filterAndSortCatalogue(products, { categorySlug: "prints" }).map(
      (product) => product.name,
    ),
    ["Sun Print"],
  );
});

test("catalogue sort modes order prices, names, dates, and featured work", () => {
  assert.deepEqual(
    filterAndSortCatalogue(products, { sort: "price-asc" }).map(
      (product) => product.name,
    ),
    ["Sun Print", "Cloud Charm", "Moon Pin"],
  );
  assert.deepEqual(
    filterAndSortCatalogue(products, { sort: "price-desc" }).map(
      (product) => product.name,
    ),
    ["Moon Pin", "Cloud Charm", "Sun Print"],
  );
  assert.deepEqual(
    filterAndSortCatalogue(products, { sort: "name" }).map(
      (product) => product.name,
    ),
    ["Cloud Charm", "Moon Pin", "Sun Print"],
  );
  assert.deepEqual(
    filterAndSortCatalogue(products, { sort: "newest" }).map(
      (product) => product.name,
    ),
    ["Cloud Charm", "Sun Print", "Moon Pin"],
  );
  assert.equal(filterAndSortCatalogue(products)[0].name, "Sun Print");
});
