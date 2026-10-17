import type { CatalogueFilter } from "@/stores/inventory-store";

import { productIssues, productStatus } from "./stock";
import type { Product } from "./types";

export const FILTERS: CatalogueFilter[] = ["All", "Clothing", "Shoes", "Low stock", "Needs details"];

export function matchesFilter(product: Product, filter: CatalogueFilter, threshold: number) {
  switch (filter) {
    case "Clothing":
    case "Shoes":
      return product.category === filter;
    case "Low stock":
      return productStatus(product, threshold) !== "In stock";
    case "Needs details":
      return productIssues(product).length > 0;
    default:
      return true;
  }
}

/** Search across name, SKU, type, category, colour and style. */
export function matchesSearch(product: Product, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [product.name, product.sku, product.type, product.category, ...product.variants.map((v) => `${v.colourName} ${v.style}`)]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function filterCatalogue(products: Product[], filter: CatalogueFilter, search: string, threshold: number) {
  return products.filter((p) => matchesFilter(p, filter, threshold) && matchesSearch(p, search));
}

/** Unique colours of a product, for swatch dots. */
export function colourDots(product: Product) {
  const seen = new Set<string>();
  return product.variants
    .filter((v) => {
      const key = v.colourName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((v) => ({ hex: v.colourHex, name: v.colourName }));
}

export function coverOf(product: Product, images: Record<string, string>) {
  const photo = product.photos[0];
  const variant = photo && product.variants.find((v) => v.id === photo.variantId);
  return {
    imageUrl: photo ? images[photo.id] : undefined,
    hex: variant?.colourHex ?? photo?.hex ?? product.variants[0]?.colourHex,
  };
}
