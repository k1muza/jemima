import type { Product, StockStatus, Variant } from "./types";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export const qtyOf = (variant: Variant, size: string) => variant.qty[size] ?? 0;

export const variantUnits = (product: Product, variant: Variant) =>
  sum(product.sizes.map((size) => qtyOf(variant, size)));

export const productUnits = (product: Product) =>
  sum(product.variants.map((variant) => variantUnits(product, variant)));

export type StockCell = { product: Product; variant: Variant; size: string; qty: number };

/** Size cells at or below the low-stock threshold (includes sold out). */
export function lowCells(product: Product, threshold: number): StockCell[] {
  return product.variants.flatMap((variant) =>
    product.sizes
      .map((size) => ({ product, variant, size, qty: qtyOf(variant, size) }))
      .filter((cell) => cell.qty <= threshold),
  );
}

export function productStatus(product: Product, threshold: number): StockStatus {
  if (!product.variants.length || productUnits(product) === 0) return "Out of stock";
  return lowCells(product, threshold).length ? "Low stock" : "In stock";
}

export type CellLevel = "ok" | "low" | "out";

export function cellLevel(qty: number, threshold: number): CellLevel {
  if (qty === 0) return "out";
  return qty <= threshold ? "low" : "ok";
}

/** Missing details that keep a product off the shelf. */
export function productIssues(product: Product): string[] {
  const issues: string[] = [];
  if (!product.photos.length) issues.push("No photos");
  if (!product.priceCents) issues.push("No price");
  if (!product.sku) issues.push("No SKU");
  if (!product.name) issues.push("No name");
  return issues;
}

/** Potential margin (no sales data exists, so this is never realised profit). */
export function margin(product: Product): number | null {
  if (!product.priceCents) return null;
  return (product.priceCents - product.costCents) / product.priceCents;
}

export function isEmptyProduct(product: Product) {
  return !product.name && !product.photos.length && !product.variants.length;
}

export const sumOf = sum;
