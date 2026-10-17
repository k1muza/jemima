import { cellLevel, qtyOf, type CellLevel } from "./stock";
import type { Product, StockMovement, Variant } from "./types";

/** One stocked item: product + variant + size (spec: InventorySKU). */
export type SkuRow = {
  key: string;
  product: Product;
  variant: Variant;
  size: string;
  /** Display code, e.g. KN-1040-OAT-M. */
  code: string;
  qty: number;
  level: CellLevel;
  updatedAt: string;
};

export const skuKey = (productId: string, variantId: string, size: string) => `${productId}|${variantId}|${size}`;

function skuCode(product: Product, variant: Variant, size: string) {
  const colour = variant.colourName.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "COL";
  return [product.sku || "NOSKU", colour, size].join("-");
}

/**
 * Suggest a product SKU like KN-1523: two letters from the type (else name, else
 * category) and the next number after the highest one already in the catalogue.
 */
export function suggestSku(product: Product, products: Product[]) {
  const source = [product.type, product.name, product.category].find((s) => /[a-z]/i.test(s)) ?? "";
  const prefix = source.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase().padEnd(2, "X");
  const taken = new Set(products.filter((p) => p.id !== product.id).map((p) => p.sku.toUpperCase()));
  let n = Math.max(1000, ...[...taken].map((sku) => Number(sku.match(/(\d+)$/)?.[1] ?? 0))) + 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Every product × variant × size, with last-updated taken from its newest movement. */
export function skuRows(products: Product[], movements: StockMovement[], threshold: number): SkuRow[] {
  const lastMovement = new Map<string, string>();
  for (const m of movements) {
    const key = skuKey(m.productId, m.variantId, m.size);
    if (!lastMovement.has(key)) lastMovement.set(key, m.at); // movements are newest first
  }
  return products.flatMap((product) =>
    product.variants.flatMap((variant) =>
      product.sizes.map((size) => {
        const key = skuKey(product.id, variant.id, size);
        const qty = qtyOf(variant, size);
        return {
          key,
          product,
          variant,
          size,
          code: skuCode(product, variant, size),
          qty,
          level: cellLevel(qty, threshold),
          updatedAt: lastMovement.get(key) ?? product.updatedAt,
        };
      }),
    ),
  );
}

export const levelStatus = { ok: "In stock", low: "Low stock", out: "Out of stock" } as const;
