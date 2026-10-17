import { formatMoney } from "@/lib/inventory/format";
import { productUnits, variantUnits } from "@/lib/inventory/stock";
import type { Catalogue, Product } from "@/lib/inventory/types";

/** A photo, or the product colour when there's no photo (drawn as a striped placeholder). */
export type PhotoRef = { hex: string; imageUrl?: string };

/** One product as it appears in a catalogue. */
export type CatalogueItem = {
  id: string;
  name: string;
  type: string;
  /** Formatted, or "" when the product has no price. */
  price: string;
  colours: { name: string; hex: string }[];
  cover: PhotoRef;
  /** Second and third photos, shown on "one per page" layouts. */
  thumbs: PhotoRef[];
};

export type CataloguePage =
  | { kind: "grid"; items: CatalogueItem[]; number: number }
  | { kind: "feature"; item: CatalogueItem; number: number };

export const GRID_PER_PAGE = 6;
const PLACEHOLDER_HEX = "#d9d1c4";
/** Cover background when the catalogue has no products. */
export const EMPTY_COVER_HEX = "#2b2621";

/** "Autumn / Winter 2026" — the season a catalogue made today is most likely for. */
export function seasonTitle(date = new Date()) {
  const month = date.getMonth(); // Feb–Jul → spring/summer
  return month >= 1 && month <= 6 ? `Spring / Summer ${date.getFullYear()}` : `Autumn / Winter ${date.getFullYear()}`;
}

/** `overrides` may be a whole catalogue (when duplicating); the new id always wins. */
export function newCatalogue(id: string, overrides: Partial<Catalogue> = {}): Catalogue {
  return {
    name: "All pieces",
    title: seasonTitle(),
    subtitle: "New pieces for the season",
    layout: "Grid",
    cover: true,
    showPrices: true,
    showColours: true,
    hideSoldOut: true,
    productIds: null,
    department: "All",
    colourFilter: [],
    ...overrides,
    id,
  };
}

/** Until products are picked, a catalogue holds every priced product in stock. */
export const defaultSelection = (products: Product[]) =>
  products.filter((p) => p.priceCents > 0 && productUnits(p) > 0).map((p) => p.id);

export const selectedIds = (catalogue: Catalogue, products: Product[]) =>
  catalogue.productIds ?? defaultSelection(products);

const colourKey = (name: string) => name.trim().toLowerCase();

/** Products shown in the editor's list after the department and colour filters. */
export function filterForEditor(catalogue: Catalogue, products: Product[]) {
  return products.filter(
    (p) =>
      (catalogue.department === "All" || p.category === catalogue.department) &&
      (!catalogue.colourFilter.length || p.variants.some((v) => catalogue.colourFilter.includes(colourKey(v.colourName)))),
  );
}

/** The most common colours across all products, for the editor's colour filter. */
export function colourOptions(products: Product[], limit = 14) {
  const counts = new Map<string, { name: string; hex: string; count: number }>();
  for (const p of products) {
    for (const v of p.variants) {
      const key = colourKey(v.colourName);
      if (!key) continue;
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { name: v.colourName.trim(), hex: v.colourHex, count: 1 });
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([key, { name, hex }]) => ({ key, name, hex }));
}

function photoRef(product: Product, index: number, images: Record<string, string>): PhotoRef | null {
  const photo = product.photos[index];
  if (!photo) return null;
  const variant = product.variants.find((v) => v.id === photo.variantId);
  return { hex: variant?.colourHex ?? photo.hex ?? PLACEHOLDER_HEX, imageUrl: images[photo.id] };
}

/** The products a catalogue prints, in product-list order. */
export function catalogueItems(catalogue: Catalogue, products: Product[], images: Record<string, string>): CatalogueItem[] {
  const ids = new Set(selectedIds(catalogue, products));
  return products
    .filter((p) => ids.has(p.id) && (!catalogue.hideSoldOut || productUnits(p) > 0))
    .map((p) => {
      const variants = catalogue.hideSoldOut ? p.variants.filter((v) => variantUnits(p, v) > 0) : p.variants;
      const seen = new Set<string>();
      const colours = variants
        .filter((v) => {
          const key = colourKey(v.colourName);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((v) => ({ name: v.colourName.trim(), hex: v.colourHex }));
      return {
        id: p.id,
        name: p.name || "Untitled",
        type: p.type || p.category,
        price: p.priceCents ? formatMoney(p.priceCents) : "",
        colours,
        cover: photoRef(p, 0, images) ?? { hex: p.variants[0]?.colourHex ?? PLACEHOLDER_HEX },
        thumbs: [photoRef(p, 1, images), photoRef(p, 2, images)].filter((x): x is PhotoRef => !!x),
      };
    });
}

/** Content pages (after the optional cover). Page numbers count the cover. */
export function cataloguePages(catalogue: Catalogue, items: CatalogueItem[]): CataloguePage[] {
  const first = catalogue.cover ? 2 : 1;
  if (catalogue.layout === "Feature") {
    return items.map((item, i) => ({ kind: "feature", item, number: first + i }));
  }
  const pages: CataloguePage[] = [];
  for (let i = 0; i < items.length; i += GRID_PER_PAGE) {
    pages.push({ kind: "grid", items: items.slice(i, i + GRID_PER_PAGE), number: first + pages.length });
  }
  return pages;
}

export const pageCount = (catalogue: Catalogue, items: CatalogueItem[]) =>
  cataloguePages(catalogue, items).length + (catalogue.cover ? 1 : 0);

/** The cover shows the first product with a photo. */
export const coverPhoto = (items: CatalogueItem[]): PhotoRef =>
  (items.find((i) => i.cover.imageUrl) ?? items[0])?.cover ?? { hex: EMPTY_COVER_HEX };

export const catalogueFooter = (catalogue: Catalogue, storeName: string) =>
  catalogue.showPrices ? "Prices in USD" : storeName;

/** File name stem, e.g. "jemimas-designs-all-pieces". */
export function catalogueFileName(catalogue: Catalogue, storeName: string) {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return [slug(storeName) || "catalogue", slug(catalogue.name || catalogue.title)].filter(Boolean).join("-");
}
