"use client";

import { useState } from "react";
import { toast } from "sonner";

import { QtyInput } from "@/components/inventory/inputs";
import { cellLevelClasses, cellLevelLabel, Panel, photoBackground, Swatch } from "@/components/inventory/primitives";
import { formatNumber } from "@/lib/inventory/format";
import { cellLevel, productUnits, qtyOf, sumOf, variantUnits } from "@/lib/inventory/stock";
import type { Product } from "@/lib/inventory/types";
import { useInventory } from "@/providers/inventory-store-provider";

export function StockMatrix({ product }: { product: Product }) {
  const threshold = useInventory((s) => s.threshold);
  const images = useInventory((s) => s.images);
  const { setQty, updateVariant, removeVariant, addSize, removeSize, addPlainVariant, restoreProduct } = useInventory((s) => s);
  const [newSize, setNewSize] = useState("");

  const units = productUnits(product);
  const many = product.sizes.length > 8;
  const columns = many
    ? `minmax(150px,1fr) repeat(${product.sizes.length},42px) 46px 28px`
    : `minmax(190px,1fr) repeat(${product.sizes.length},52px) 52px 28px`;

  const submitSize = () => {
    if (addSize(product.id, newSize)) setNewSize("");
    else if (newSize.trim()) toast.error(`${newSize.trim().toUpperCase()} is already a size.`);
  };

  /** Run a destructive edit with an Undo toast. */
  const withUndo = (message: string, fn: () => void) => {
    const snapshot = product;
    fn();
    toast(message, { action: { label: "Undo", onClick: () => restoreProduct(snapshot) } });
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-[30px] font-normal">Stock</h2>
          <span className="text-xs text-subtle">
            {product.variants.length
              ? `One row per colour. ${formatNumber(units)} units in total.`
              : "Rows appear as you add photos."}
          </span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSize();
          }}
          className="flex overflow-hidden rounded-[9px] border bg-card"
        >
          <input
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            placeholder="New size"
            aria-label="New size"
            className="h-9 w-24 bg-transparent px-3 font-mono text-[13px] outline-none"
          />
          <button type="submit" className="border-l bg-secondary px-3.5 text-[13px] font-medium transition-colors hover:bg-muted">
            Add size
          </button>
        </form>
      </div>

      {product.variants.length > 0 ? (
        <Panel className="overflow-x-auto">
          <div className="min-w-max" role="table" aria-label="Stock by colour and size">
            <div role="row" className="grid items-center gap-1 border-b border-line-soft px-[18px] py-3 text-xs text-subtle" style={{ gridTemplateColumns: columns }}>
              <span role="columnheader" className="sticky left-0 z-[1] bg-card self-stretch py-0">Colour · style</span>
              {product.sizes.map((size) => (
                <span key={size} role="columnheader" className="flex items-center justify-center gap-px font-mono text-xs font-medium text-foreground">
                  {size}
                  <button
                    type="button"
                    onClick={() => withUndo(`Size ${size} removed`, () => removeSize(product.id, size))}
                    title={`Remove size ${size}`}
                    aria-label={`Remove size ${size}`}
                    className="px-0.5 text-xs text-[#c2b9ab] hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
              <span role="columnheader" className="text-right">Total</span>
              <span />
            </div>

            {product.variants.map((v) => {
              const photo = product.photos.find((ph) => ph.variantId === v.id);
              return (
                <div key={v.id} role="row" className="grid items-center gap-1 border-b border-line-soft px-[18px] py-2" style={{ gridTemplateColumns: columns }}>
                  <div role="rowheader" className="sticky left-0 z-[1] bg-card flex min-w-0 items-center gap-2 self-stretch">
                    <span className="h-[42px] w-[34px] shrink-0 overflow-hidden rounded-md" style={photoBackground(v.colourHex, photo && images[photo.id])} />
                    <Swatch hex={v.colourHex} title={v.colourStatus === "corrected" ? "Colour (edited)" : "Detected colour"} className="size-3" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <input
                        size={1}
                        value={v.colourName}
                        onChange={(e) => updateVariant(product.id, v.id, { colourName: e.target.value })}
                        placeholder="Colour"
                        aria-label="Colour name"
                        className="h-[26px] w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium hover:border-border focus:border-foreground focus:bg-card focus:outline-none"
                      />
                      <input
                        size={1}
                        value={v.style}
                        onChange={(e) => updateVariant(product.id, v.id, { style: e.target.value })}
                        placeholder="Style (optional)"
                        aria-label="Style"
                        className="h-6 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs text-muted-foreground hover:border-border focus:border-foreground focus:bg-card focus:outline-none"
                      />
                    </span>
                  </div>
                  {product.sizes.map((size) => {
                    const level = cellLevel(qtyOf(v, size), threshold);
                    return (
                      <span key={size} role="cell">
                        <QtyInput
                          value={v.qty[size] ?? null}
                          onValue={(qty) => setQty(product.id, v.id, size, qty)}
                          aria-label={`${v.colourName || "Colour"} size ${size}, ${cellLevelLabel[level]}`}
                          title={cellLevelLabel[level]}
                          className={cellLevelClasses[level]}
                        />
                      </span>
                    );
                  })}
                  <span role="cell" className="text-right text-[15px] font-semibold tabular-nums">
                    {formatNumber(variantUnits(product, v))}
                  </span>
                  <button
                    type="button"
                    onClick={() => withUndo(`${v.colourName || "Row"} removed`, () => removeVariant(product.id, v.id))}
                    title="Remove this row"
                    aria-label={`Remove ${v.colourName || "this"} row`}
                    className="size-7 rounded-full text-base text-[#c2b9ab] transition-colors hover:bg-secondary hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            <div role="row" className="grid items-center gap-1 px-[18px] py-3 text-[13px] text-muted-foreground" style={{ gridTemplateColumns: columns }}>
              <span role="rowheader" className="sticky left-0 z-[1] bg-card">Total per size</span>
              {product.sizes.map((size) => (
                <span key={size} role="cell" className="text-center tabular-nums">
                  {formatNumber(sumOf(product.variants.map((v) => qtyOf(v, size))))}
                </span>
              ))}
              <span role="cell" className="text-right font-serif text-2xl text-foreground">{formatNumber(units)}</span>
              <span />
            </div>
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-strong-line p-7">
          <span className="text-sm leading-normal text-muted-foreground">
            Add photos above and each colour gets its own stock row automatically.
          </span>
          <button
            type="button"
            onClick={() => addPlainVariant(product.id)}
            className="rounded-lg border border-strong-line bg-card px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-foreground"
          >
            Add a row without a photo
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-[18px] text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-low-bg shadow-[inset_0_0_0_1px_var(--low-line)]" />
          Low ({threshold} or fewer)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-out-bg shadow-[inset_0_0_0_1px_var(--out-line)]" />
          Sold out
        </span>
        <span>Tab moves to the next cell. Arrow keys nudge a value up or down.</span>
      </div>
    </section>
  );
}
