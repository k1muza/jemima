"use client";

import { ChevronDown, History } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

import { AdjustStockPopover } from "@/components/inventory/adjust-stock";
import { MovementList } from "@/components/inventory/movement-list";
import {
  buttonStyles,
  cellLevelClasses,
  cellLevelLabel,
  PageHeader,
  Panel,
  photoBackground,
  Segmented,
  StatusBadge,
  Swatch,
} from "@/components/inventory/primitives";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { colourDots, coverOf, matchesSearch } from "@/lib/inventory/catalogue";
import { csvDate, csvMoney, downloadCsv } from "@/lib/inventory/csv";
import { formatDateTime, formatMoney, formatNumber, formatPercent, plural } from "@/lib/inventory/format";
import { levelStatus, skuRows } from "@/lib/inventory/sku";
import { cellLevel, margin, productStatus, productUnits, qtyOf, sumOf, variantUnits } from "@/lib/inventory/stock";
import { CATEGORIES, type Category, type Product, type StockStatus } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useAccess, useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

/** One product with its totals, for the per-product table. */
type ProductRow = {
  product: Product;
  units: number;
  status: StockStatus;
  /** Sizes with at least one unit, across all colours. */
  sizesInStock: number;
  updatedAt: string;
};

type LevelFilter = "All" | "In stock" | "Running low" | "Sold out";
type CategoryFilter = "All" | Category;
type Sort = "product" | "qty-asc" | "qty-desc" | "updated";

/** Overlapping on purpose: a product with 3 units left is both "In stock" and "Running low". */
const LEVEL_FILTERS: Record<LevelFilter, (row: ProductRow) => boolean> = {
  All: () => true,
  "In stock": (r) => r.units > 0,
  "Running low": (r) => r.status === "Low stock",
  "Sold out": (r) => r.status === "Out of stock",
};

const SORTS: { value: Sort; label: string }[] = [
  { value: "product", label: "Product A–Z" },
  { value: "qty-asc", label: "Fewest units" },
  { value: "qty-desc", label: "Most units" },
  { value: "updated", label: "Recently updated" },
];

const COLUMNS =
  "grid-cols-[minmax(220px,1.4fr)_minmax(96px,0.7fr)_minmax(220px,2fr)_56px_72px_72px_60px_104px_92px_68px]";

const sizeTotal = (product: Product, size: string) => sumOf(product.variants.map((v) => qtyOf(v, size)));

export function InventoryTable() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <InventorySkeleton />;
  return <InventoryContent />;
}

function InventoryContent() {
  const products = useInventory((s) => s.products);
  const movements = useInventory((s) => s.movements);
  const threshold = useInventory((s) => s.threshold);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LevelFilter>("All");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [sort, setSort] = useState<Sort>("product");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [historyFor, setHistoryFor] = useState<Product | null>(null);

  const { canViewCosts } = useAccess();
  const all = useMemo<ProductRow[]>(() => {
    const lastMovement = new Map<string, string>();
    for (const m of movements) if (!lastMovement.has(m.productId)) lastMovement.set(m.productId, m.at); // newest first
    return products.map((product) => ({
      product,
      units: productUnits(product),
      status: productStatus(product, threshold),
      sizesInStock: product.sizes.filter((size) => sizeTotal(product, size) > 0).length,
      updatedAt: lastMovement.get(product.id) ?? product.updatedAt,
    }));
  }, [products, movements, threshold]);

  const inScope = all.filter(
    (r) => (category === "All" || r.product.category === category) && matchesSearch(r.product, search),
  );
  const rows = inScope.filter(LEVEL_FILTERS[level]).sort((a, b) => {
    switch (sort) {
      case "qty-asc":
        return a.units - b.units;
      case "qty-desc":
        return b.units - a.units;
      case "updated":
        return b.updatedAt.localeCompare(a.updatedAt);
      default:
        return a.product.name.localeCompare(b.product.name);
    }
  });

  const units = rows.reduce((n, r) => n + r.units, 0);
  const low = all.filter(LEVEL_FILTERS["Running low"]).length;
  const out = all.filter(LEVEL_FILTERS["Sold out"]).length;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // The export stays one line per colour × size so it works as a stock count sheet.
  const exportCsv = () =>
    downloadCsv(
      `inventory-${csvDate()}.csv`,
      [
        "SKU",
        "Product",
        "Category",
        "Type",
        "Colour",
        "Style",
        "Size",
        "Quantity",
        ...(canViewCosts ? ["Unit cost (USD)"] : []),
        "Unit price (USD)",
        "Status",
        "Last updated",
      ],
      skuRows(
        rows.map((r) => r.product),
        movements,
        threshold,
      ).map((r) => [
        r.code,
        r.product.name,
        r.product.category,
        r.product.type,
        r.variant.colourName,
        r.variant.style,
        r.size,
        r.qty,
        ...(canViewCosts ? [csvMoney(r.product.costCents)] : []),
        csvMoney(r.product.priceCents),
        levelStatus[r.level],
        r.updatedAt,
      ]),
    );

  return (
    <>
      <PageHeader
        eyebrow={`${plural(all.length, "product")} · ${formatNumber(low)} running low · ${formatNumber(out)} sold out`}
        title="Inventory"
        actions={
          <button type="button" onClick={exportCsv} className={buttonStyles.outline}>
            Export CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, SKU or colour"
          aria-label="Search inventory"
          className="h-10 max-w-[340px] flex-[1_1_240px] rounded-[9px] border bg-card px-3.5 text-sm focus:border-foreground focus:outline-none"
        />
        <Segmented
          label="Stock level"
          value={level}
          onChange={setLevel}
          options={(Object.keys(LEVEL_FILTERS) as LevelFilter[]).map((l) => ({
            value: l,
            label: l,
            count: inScope.filter(LEVEL_FILTERS[l]).length,
          }))}
        />
        <Segmented
          label="Category"
          value={category}
          onChange={setCategory}
          options={(["All", ...CATEGORIES] as CategoryFilter[]).map((c) => ({ value: c, label: c }))}
        />
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-10 rounded-[9px] border bg-card px-3 text-sm text-foreground focus:border-foreground focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Phones: a compact list; tap a product to see and adjust its sizes. */}
      <Panel className="md:hidden">
        <ul aria-label="Inventory by product">
          {rows.map((row) => (
            <InventoryListItem
              key={row.product.id}
              row={row}
              open={expanded.has(row.product.id)}
              onToggle={() => toggle(row.product.id)}
              onHistory={() => setHistoryFor(row.product)}
            />
          ))}
        </ul>
        {!rows.length && <div className="px-5 py-12 text-center text-sm text-subtle">No products match.</div>}
      </Panel>

      <Panel className="hidden max-h-[calc(100svh-260px)] min-h-[320px] overflow-auto md:block">
        <div className="min-w-[1120px]" role="table" aria-label="Inventory by product">
          <div
            role="row"
            className={cn("sticky top-0 z-[2] grid items-center gap-3 border-b bg-card px-5 py-3 text-xs text-subtle", COLUMNS)}
          >
            <span role="columnheader" className="sticky left-0 z-[3] -ml-5 bg-card pl-5">
              Product
            </span>
            <span role="columnheader">Colours</span>
            <span role="columnheader" title="Units per size, all colours combined">
              Sizes
            </span>
            <span role="columnheader" className="text-right">
              Units
            </span>
            <span role="columnheader">Cost</span>
            <span role="columnheader">Price</span>
            <span role="columnheader" className="text-right" title="Potential gross margin">
              Margin
            </span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader" className="sr-only">
              Actions
            </span>
          </div>
          {rows.map((row) => (
            <Fragment key={row.product.id}>
              <InventoryRow
                row={row}
                open={expanded.has(row.product.id)}
                onToggle={() => toggle(row.product.id)}
                onHistory={() => setHistoryFor(row.product)}
              />
              {expanded.has(row.product.id) && (
                <div className="border-b border-line-soft bg-[#faf7f2] px-5 py-4 pl-[68px]">
                  <StockBreakdown product={row.product} />
                </div>
              )}
            </Fragment>
          ))}
          {!rows.length && <div className="px-5 py-12 text-center text-sm text-subtle">No products match.</div>}
        </div>
      </Panel>
      <p className="-mt-4 text-xs text-subtle">
        Showing {plural(rows.length, "product")} · {formatNumber(units)} units. Expand a product to adjust a size; every
        change is kept in the history. Low means {threshold} or fewer of a size.
      </p>

      <Sheet open={historyFor !== null} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <SheetContent className="gap-0 overflow-y-auto bg-card p-0 sm:max-w-md">
          {historyFor && (
            <>
              <SheetHeader className="gap-1 px-[22px] pt-[22px] pb-4">
                <SheetTitle className="font-serif text-[28px] font-normal">Stock history</SheetTitle>
                <SheetDescription>{historyFor.name || "Untitled product"}</SheetDescription>
              </SheetHeader>
              <MovementList
                showItem={false}
                products={products}
                movements={movements.filter((m) => m.productId === historyFor.id)}
                empty="No changes recorded for this product yet."
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Each size with its total across colours, tinted when low or sold out. */
function SizeStrip({ product }: { product: Product }) {
  const threshold = useInventory((s) => s.threshold);
  if (!product.sizes.length) return <span className="text-xs text-subtle">No sizes</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {product.sizes.map((size) => {
        const qty = sizeTotal(product, size);
        const level = cellLevel(qty, threshold);
        return (
          <span
            key={size}
            title={`${size}: ${qty}, ${cellLevelLabel[level]}`}
            className={cn("flex min-w-8 flex-col items-center rounded-md border px-1 py-0.5 leading-tight", cellLevelClasses[level])}
          >
            <span className="font-mono text-[10px] opacity-70">{size}</span>
            <span className="text-xs font-medium tabular-nums">{qty}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Colour × size grid; each quantity opens Adjust Stock, which records a movement with Undo. */
function StockBreakdown({ product }: { product: Product }) {
  const threshold = useInventory((s) => s.threshold);
  if (!product.variants.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No colours yet.{" "}
        <Link href={`/dashboard/products/${product.id}`} className="underline underline-offset-2">
          Add photos to the product
        </Link>{" "}
        to start tracking stock.
      </p>
    );
  }
  const columns = `minmax(140px,max-content) repeat(${product.sizes.length},48px) 48px`;
  return (
    <div className="overflow-x-auto">
      <div className="grid w-max items-center gap-1.5 text-sm" style={{ gridTemplateColumns: columns }}>
        <span className="text-xs text-subtle">Colour · style</span>
        {product.sizes.map((size) => (
          <span key={size} className="text-center font-mono text-xs font-medium">
            {size}
          </span>
        ))}
        <span className="text-right text-xs text-subtle">Total</span>

        {product.variants.map((v) => (
          <Fragment key={v.id}>
            <span className="flex min-w-0 items-center gap-2 pr-3">
              <Swatch hex={v.colourHex} className="size-3" />
              <span className="truncate">
                {v.colourName || "Colour"}
                {v.style && <span className="text-subtle"> · {v.style}</span>}
              </span>
            </span>
            {product.sizes.map((size) => {
              const qty = qtyOf(v, size);
              const level = cellLevel(qty, threshold);
              const label = `${product.name || "Untitled"} · ${v.colourName} · ${size}`;
              return (
                <AdjustStockPopover
                  key={size}
                  target={{ productId: product.id, variantId: v.id, size, label, qty }}
                  trigger={
                    <button
                      type="button"
                      aria-label={`${label}: ${qty}, ${cellLevelLabel[level]}. Adjust stock`}
                      title="Adjust stock"
                      className={cn(
                        "h-8 rounded-lg border text-center font-mono text-sm font-medium transition-colors hover:border-foreground",
                        cellLevelClasses[level],
                      )}
                    >
                      {qty}
                    </button>
                  }
                />
              );
            })}
            <span className="text-right font-semibold tabular-nums">{formatNumber(variantUnits(product, v))}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ExpandButton({ open, onToggle, name }: { open: boolean; onToggle: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} sizes for ${name}`}
      title={open ? "Hide sizes" : "Adjust sizes"}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function HistoryButton({ onHistory, name }: { onHistory: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onHistory}
      title="Stock history"
      aria-label={`Stock history for ${name}`}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <History className="size-4" />
    </button>
  );
}

type RowProps = { row: ProductRow; open: boolean; onToggle: () => void; onHistory: () => void };

function InventoryListItem({ row, open, onToggle, onHistory }: RowProps) {
  const images = useInventory((s) => s.images);
  const { product, units, status } = row;
  const cover = coverOf(product, images);
  const name = product.name || "Untitled product";
  return (
    <li className="border-t border-line-soft first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="h-12 w-10 shrink-0 overflow-hidden rounded-md" style={photoBackground(cover.hex, cover.imageUrl)} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={`/dashboard/products/${product.id}`} className="truncate text-sm font-medium">
            {name}
          </Link>
          <span className="text-xs text-subtle">
            {plural(units, "unit")} · {row.sizesInStock} of {plural(product.sizes.length, "size")} in stock
          </span>
          <span>
            <StatusBadge status={status} className="text-[11px]" />
          </span>
        </span>
        <HistoryButton onHistory={onHistory} name={name} />
        <ExpandButton open={open} onToggle={onToggle} name={name} />
      </div>
      {open && (
        <div className="bg-[#faf7f2] px-4 py-3">
          <StockBreakdown product={product} />
        </div>
      )}
    </li>
  );
}

function InventoryRow({ row, open, onToggle, onHistory }: RowProps) {
  const { canViewCosts } = useAccess();
  const images = useInventory((s) => s.images);
  const { product, units, status } = row;
  const cover = coverOf(product, images);
  const name = product.name || "Untitled product";
  const colours = colourDots(product);

  return (
    <div
      role="row"
      className={cn("group grid items-center gap-3 border-b border-line-soft px-5 py-2 text-sm hover:bg-[#faf7f2]", COLUMNS)}
    >
      <span
        role="rowheader"
        className="sticky left-0 z-[1] -ml-5 flex min-w-0 items-center gap-3 bg-card py-0.5 pl-5 group-hover:bg-[#faf7f2]"
      >
        <span className="h-11 w-9 shrink-0 overflow-hidden rounded-md" style={photoBackground(cover.hex, cover.imageUrl)} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/dashboard/products/${product.id}`} className="truncate font-medium">
            {name}
          </Link>
          <span className="truncate font-mono text-[11px] text-subtle">{product.sku || "No SKU"}</span>
        </span>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2" title={colours.map((c) => c.name).join(", ")}>
        <span className="flex -space-x-1">
          {colours.slice(0, 4).map((c) => (
            <Swatch key={c.name} hex={c.hex} className="size-3.5 ring-2 ring-card" />
          ))}
        </span>
        <span className="truncate text-muted-foreground">
          {colours.length === 1 ? colours[0].name : plural(colours.length, "colour")}
        </span>
      </span>
      <span role="cell">
        <SizeStrip product={product} />
      </span>
      <span role="cell" className="text-right font-semibold tabular-nums">
        {formatNumber(units)}
      </span>
      <span role="cell" className="tabular-nums text-muted-foreground">
        {canViewCosts ? formatMoney(product.costCents) : "—"}
      </span>
      <span role="cell" className="font-medium tabular-nums">
        {product.priceCents ? formatMoney(product.priceCents) : "—"}
      </span>
      <span role="cell" className="text-right tabular-nums text-muted-foreground">
        {canViewCosts ? formatPercent(margin(product)) : "—"}
      </span>
      <span role="cell">
        <StatusBadge status={status} />
      </span>
      <span role="cell" className="text-xs text-subtle">
        {formatDateTime(row.updatedAt)}
      </span>
      <span role="cell" className="flex items-center">
        <HistoryButton onHistory={onHistory} name={name} />
        <ExpandButton open={open} onToggle={onToggle} name={name} />
      </span>
    </div>
  );
}

function InventorySkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-14 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-3xl" />
      <Skeleton className="h-[520px] rounded-[14px]" />
    </>
  );
}
