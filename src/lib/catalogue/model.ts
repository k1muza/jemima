import { luminance } from "@/lib/inventory/colour";
import { photoSrc } from "@/lib/inventory/cutout";
import { formatMoney } from "@/lib/inventory/format";
import { productUnits, variantUnits } from "@/lib/inventory/stock";
import { normalizeWhatsappCatalogUrl } from "@/lib/inventory/whatsapp";
import type { Catalogue, CatalogueTheme, Product } from "@/lib/inventory/types";

/**
 * A photo, or the product colour when there's no photo (drawn as a striped
 * placeholder). `backdrop` fills behind a transparent (background-removed)
 * photo; without one the photo stays see-through. `link` is the product's
 * WhatsApp catalogue item, opened when the photo is clicked.
 */
export type PhotoRef = { hex: string; imageUrl?: string; backdrop?: string; link?: string };

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

/** The designs a catalogue can use. `swatch` colours the picker preview: page, ink, accent. */
export const CATALOGUE_THEMES: {
  value: CatalogueTheme;
  label: string;
  description: string;
  /** Products on a grid page. */
  perPage: number;
  swatch: { page: string; ink: string; accent: string };
}[] = [
  {
    value: "Classic",
    label: "Classic",
    description: "Dark cover, warm paper, italic serif titles.",
    perPage: 6,
    swatch: { page: "#fffdf9", ink: "#1a1714", accent: "#1a1714" },
  },
  {
    value: "Atelier",
    label: "Atelier",
    description: "Crisp white and lots of space. Small capitals, numbered pieces.",
    perPage: 6,
    swatch: { page: "#ffffff", ink: "#111111", accent: "#d8d8d8" },
  },
  {
    value: "Lookbook",
    label: "Lookbook",
    description: "Magazine style. Full-bleed photos, four large pieces a page.",
    perPage: 4,
    swatch: { page: "#f4f1eb", ink: "#151412", accent: "#151412" },
  },
  {
    value: "Boutique",
    label: "Boutique",
    description: "Warm blush and terracotta, arched photo frames.",
    perPage: 6,
    swatch: { page: "#f6ebe3", ink: "#3b2320", accent: "#b4553d" },
  },
];

export const themeInfo = (theme: CatalogueTheme) => CATALOGUE_THEMES.find((t) => t.value === theme) ?? CATALOGUE_THEMES[0];
const PLACEHOLDER_HEX = "#d9d1c4";
/**
 * Tones that background-removed photos sit on: oatmeal, ecru, charcoal, mist,
 * olive, slate. Without a garment to contrast with they're used in this order.
 */
export const PHOTO_BACKDROPS = ["#d9ccb6", "#ece4d4", "#1f1e1d", "#f2f1ee", "#5d5f41", "#5b636f"];
/** The luminance gap between garment and backdrop that reads as clear contrast. */
const STRONG_CONTRAST = 0.35;

/**
 * Picks backdrops product by product: dark tones behind light pieces, light
 * tones behind dark ones (`garment` is luminance, 0–1). Each group of
 * suitable tones takes turns, so neighbouring products of a kind differ.
 */
export function backdropPicker() {
  const turns = new Map<string, number>();
  const next = (tones: string[]) => {
    const key = tones.join();
    const turn = turns.get(key) ?? 0;
    turns.set(key, turn + 1);
    return tones[turn % tones.length];
  };
  return (garment?: number) => {
    if (garment === undefined) return next(PHOTO_BACKDROPS);
    const gap = (tone: string) => Math.abs(luminance(tone) - garment);
    const suitable = PHOTO_BACKDROPS.filter((tone) => gap(tone) >= STRONG_CONTRAST);
    // A mid-tone garment may have no strongly contrasting tone: use the furthest.
    if (!suitable.length) return PHOTO_BACKDROPS.reduce((best, tone) => (gap(tone) > gap(best) ? tone : best));
    return next(suitable);
  };
}
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
    theme: "Classic",
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

function photoRef(product: Product, index: number, images: Record<string, string>, backdrop?: string): PhotoRef | null {
  const photo = product.photos[index];
  if (!photo) return null;
  const variant = product.variants.find((v) => v.id === photo.variantId);
  return {
    hex: variant?.colourHex ?? photo.hex ?? PLACEHOLDER_HEX,
    imageUrl: photoSrc(images, photo),
    backdrop,
    link: whatsappLink(product),
  };
}

/** Only well-formed WhatsApp catalogue links are made clickable. */
const whatsappLink = (product: Product) => normalizeWhatsappCatalogUrl(product.whatsappCatalogUrl ?? "") || undefined;

/** The products a catalogue prints, in product-list order. */
/**
 * `tones` holds the measured garment luminance of cutout photos by URL (see
 * `photoLuminances`); until a photo is measured its variant colour stands in.
 */
export function catalogueItems(
  catalogue: Catalogue,
  products: Product[],
  images: Record<string, string>,
  tones: Record<string, number> = {},
): CatalogueItem[] {
  const ids = new Set(selectedIds(catalogue, products));
  const backdropFor = backdropPicker();
  return products
    .filter((p) => ids.has(p.id) && (!catalogue.hideSoldOut || productUnits(p) > 0))
    .map((p) => {
      // One tone per product, chosen to contrast with the garment in its cover photo.
      const cover = photoRef(p, 0, images);
      const hex = cover?.hex ?? p.variants[0]?.colourHex;
      const measured = cover?.imageUrl ? tones[cover.imageUrl] : undefined;
      const backdrop = backdropFor(measured ?? (hex ? luminance(hex) : undefined));
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
        cover: photoRef(p, 0, images, backdrop) ?? { hex: p.variants[0]?.colourHex ?? PLACEHOLDER_HEX, link: whatsappLink(p) },
        thumbs: [photoRef(p, 1, images, backdrop), photoRef(p, 2, images, backdrop)].filter((x): x is PhotoRef => !!x),
      };
    });
}

/** The cover photos' URLs, whose garments backdrops are chosen to contrast with. */
export const coverUrls = (items: CatalogueItem[]) => items.flatMap((item) => (item.cover.imageUrl ? [item.cover.imageUrl] : []));

/** Content pages (after the optional cover). Page numbers count the cover. */
export function cataloguePages(catalogue: Catalogue, items: CatalogueItem[]): CataloguePage[] {
  const first = catalogue.cover ? 2 : 1;
  if (catalogue.layout === "Feature") {
    return items.map((item, i) => ({ kind: "feature", item, number: first + i }));
  }
  const perPage = themeInfo(catalogue.theme).perPage;
  const pages: CataloguePage[] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push({ kind: "grid", items: items.slice(i, i + perPage), number: first + pages.length });
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
