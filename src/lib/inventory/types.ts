export type Category = "Clothing" | "Shoes";

export const CATEGORIES: Category[] = ["Clothing", "Shoes"];

export const SIZE_TEMPLATES: Record<Category, string[]> = {
  Clothing: ["XS", "S", "M", "L", "XL", "XXL"],
  Shoes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
};

/** How a variant's colour was set. AI detection never overwrites `corrected`. */
export type ColourStatus = "detected" | "corrected";

/** One colour + style combination of a product (spec: ProductVariant). */
export type Variant = {
  id: string;
  colourName: string;
  colourHex: string;
  colourStatus: ColourStatus;
  style: string;
  /** Quantity on hand per size label. `null` = left blank (counts as 0). */
  qty: Record<string, number | null>;
};

/** Image bytes live in IndexedDB under `id`; this is just the metadata. */
export type Photo = {
  id: string;
  variantId: string;
  /** Colour detected from this photo. */
  hex: string;
};

export type Product = {
  id: string;
  name: string;
  category: Category;
  type: string;
  sku: string;
  /** USD, integer cents. */
  costCents: number;
  priceCents: number;
  sizes: string[];
  variants: Variant[];
  /** First photo is the cover. */
  photos: Photo[];
  updatedAt: string;
};

export type StockStatus = "In stock" | "Low stock" | "Out of stock";
