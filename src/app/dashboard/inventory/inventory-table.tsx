"use client";

import { History, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AdjustStockPopover, useStockAdjuster } from "@/components/inventory/adjust-stock";
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
import { matchesSearch } from "@/lib/inventory/catalogue";
import { csvDate, csvMoney, downloadCsv } from "@/lib/inventory/csv";
import { formatDateTime, formatMoney, formatNumber, formatPercent, plural } from "@/lib/inventory/format";
import { levelStatus, skuKey, skuRows, type SkuRow } from "@/lib/inventory/sku";
import { margin } from "@/lib/inventory/stock";
import { CATEGORIES, type Category } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useAccess, useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

type LevelFilter = "All" | "Low" | "Sold out" | "In stock";
type CategoryFilter = "All" | Category;
type Sort = "product" | "qty-asc" | "qty-desc" | "updated";

const LEVEL_FILTERS: Record<LevelFilter, (row: SkuRow) => boolean> = {
  All: () => true,
  Low: (r) => r.level === "low",
  "Sold out": (r) => r.level === "out",
  "In stock": (r) => r.level === "ok",
};

const SORTS: { value: Sort; label: string }[] = [
  { value: "product", label: "Product A–Z" },
  { value: "qty-asc", label: "Fewest first" },
  { value: "qty-desc", label: "Most first" },
  { value: "updated", label: "Recently updated" },
];

const COLUMNS = "grid-cols-[minmax(200px,1.6fr)_minmax(120px,1fr)_52px_128px_72px_72px_60px_104px_92px_32px]";

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
  const [historyFor, setHistoryFor] = useState<SkuRow | null>(null);

  const { canViewCosts } = useAccess();
  const all = useMemo(() => skuRows(products, movements, threshold), [products, movements, threshold]);

  const inScope = all.filter(
    (r) =>
      (category === "All" || r.product.category === category) &&
      (matchesSearch(r.product, search) || r.code.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const rows = inScope.filter(LEVEL_FILTERS[level]).sort((a, b) => {
    switch (sort) {
      case "qty-asc":
        return a.qty - b.qty;
      case "qty-desc":
        return b.qty - a.qty;
      case "updated":
        return b.updatedAt.localeCompare(a.updatedAt);
      default:
        return (a.product.name + a.variant.colourName).localeCompare(b.product.name + b.variant.colourName);
    }
  });

  const units = rows.reduce((n, r) => n + r.qty, 0);
  const low = all.filter((r) => r.level === "low").length;
  const out = all.filter((r) => r.level === "out").length;

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
      rows.map((r) => [
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
        eyebrow={`${plural(all.length, "item")} · ${plural(low, "low", "low")} · ${formatNumber(out)} sold out`}
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

      {/* Phones: a compact list so the quantity control is always in view. */}
      <Panel className="md:hidden">
        <ul aria-label="Inventory by item">
          {rows.map((row) => (
            <InventoryListItem key={row.key} row={row} onHistory={() => setHistoryFor(row)} />
          ))}
        </ul>
        {!rows.length && <div className="px-5 py-12 text-center text-sm text-subtle">No items match.</div>}
      </Panel>

      <Panel className="hidden max-h-[calc(100svh-260px)] min-h-[320px] overflow-auto md:block">
        <div className="min-w-[1080px]" role="table" aria-label="Inventory by item">
          <div
            role="row"
            className={cn("sticky top-0 z-[2] grid items-center gap-3 border-b bg-card px-5 py-3 text-xs text-subtle", COLUMNS)}
          >
            <span role="columnheader" className="sticky left-0 z-[3] -ml-5 bg-card pl-5">
              Product
            </span>
            <span role="columnheader">Colour · style</span>
            <span role="columnheader">Size</span>
            <span role="columnheader">Quantity</span>
            <span role="columnheader">Cost</span>
            <span role="columnheader">Price</span>
            <span role="columnheader" className="text-right" title="Potential gross margin">
              Margin
            </span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader" className="sr-only">
              History
            </span>
          </div>
          {rows.map((row) => (
            <InventoryRow key={row.key} row={row} onHistory={() => setHistoryFor(row)} />
          ))}
          {!rows.length && <div className="px-5 py-12 text-center text-sm text-subtle">No items match.</div>}
        </div>
      </Panel>
      <p className="-mt-4 text-xs text-subtle">
        Showing {plural(rows.length, "item")} · {formatNumber(units)} units. Click a quantity to adjust it with a reason; every
        change is kept in the history.
      </p>

      <Sheet open={historyFor !== null} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <SheetContent className="gap-0 overflow-y-auto bg-card p-0 sm:max-w-md">
          {historyFor && (
            <>
              <SheetHeader className="gap-1 px-[22px] pt-[22px] pb-4">
                <SheetTitle className="font-serif text-[28px] font-normal">Stock history</SheetTitle>
                <SheetDescription>
                  {historyFor.product.name} · {historyFor.variant.colourName}
                  {historyFor.variant.style && ` ${historyFor.variant.style}`} · {historyFor.size}
                </SheetDescription>
              </SheetHeader>
              <MovementList
                showItem={false}
                products={products}
                movements={movements.filter((m) => skuKey(m.productId, m.variantId, m.size) === historyFor.key)}
                empty="No changes recorded for this item yet."
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

const rowLabel = ({ product, variant, size }: SkuRow) => `${product.name || "Untitled"} · ${variant.colourName} · ${size}`;

/** − [qty] + : the quantity opens Adjust Stock; ± are one-unit shortcuts. All record movements with Undo. */
function QtyStepper({ row, large }: { row: SkuRow; large?: boolean }) {
  const adjust = useStockAdjuster();
  const { product, variant, size, qty, level } = row;
  const label = rowLabel(row);
  const target = { productId: product.id, variantId: variant.id, size, label };
  const stepButton = cn(
    "flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30",
    large ? "size-10" : "size-7",
  );
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => adjust(target, -1, "other", "Quick adjust")}
        disabled={qty === 0}
        aria-label={`Remove one ${label}`}
        className={stepButton}
      >
        <Minus className="size-3.5" />
      </button>
      <AdjustStockPopover
        target={{ ...target, qty }}
        trigger={
          <button
            type="button"
            aria-label={`${label}: ${qty}, ${cellLevelLabel[level]}. Adjust stock`}
            title="Adjust stock"
            className={cn(
              "rounded-lg border text-center font-mono text-sm font-medium transition-colors hover:border-foreground",
              large ? "h-10 w-14" : "h-8 w-12",
              cellLevelClasses[level],
            )}
          >
            {qty}
          </button>
        }
      />
      <button
        type="button"
        onClick={() => adjust(target, 1, "restock", "Quick adjust")}
        aria-label={`Add one ${label}`}
        className={stepButton}
      >
        <Plus className="size-3.5" />
      </button>
    </span>
  );
}

function InventoryListItem({ row, onHistory }: { row: SkuRow; onHistory: () => void }) {
  const images = useInventory((s) => s.images);
  const { product, variant, size, level } = row;
  const photo = product.photos.find((ph) => ph.variantId === variant.id) ?? product.photos[0];
  return (
    <li className="flex items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0">
      <span
        className="h-12 w-10 shrink-0 overflow-hidden rounded-md"
        style={photoBackground(variant.colourHex, photo && images[photo.id])}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={`/dashboard/products/${product.id}`} className="truncate text-sm font-medium">
          {product.name || "Untitled product"}
        </Link>
        <span className="flex items-center gap-1.5 truncate text-xs text-subtle">
          <Swatch hex={variant.colourHex} className="size-2.5" />
          {variant.colourName}
          {variant.style && ` · ${variant.style}`} · <span className="font-mono font-medium text-foreground">{size}</span>
        </span>
        <span className="text-[11px] text-subtle">
          {levelStatus[level]} ·{" "}
          <button
            type="button"
            onClick={onHistory}
            aria-label={`Stock history for ${rowLabel(row)}`}
            className="underline underline-offset-2"
          >
            History
          </button>
        </span>
      </span>
      <QtyStepper row={row} large />
    </li>
  );
}

function InventoryRow({ row, onHistory }: { row: SkuRow; onHistory: () => void }) {
  const { canViewCosts } = useAccess();
  const images = useInventory((s) => s.images);
  const { product, variant, size, level } = row;
  const photo = product.photos.find((ph) => ph.variantId === variant.id) ?? product.photos[0];
  const label = rowLabel(row);

  return (
    <div
      role="row"
      className={cn("group grid items-center gap-3 border-b border-line-soft px-5 py-2 text-sm hover:bg-[#faf7f2]", COLUMNS)}
    >
      <span
        role="rowheader"
        className="sticky left-0 z-[1] -ml-5 flex min-w-0 items-center gap-3 bg-card py-0.5 pl-5 group-hover:bg-[#faf7f2]"
      >
        <span
          className="h-11 w-9 shrink-0 overflow-hidden rounded-md"
          style={photoBackground(variant.colourHex, photo && images[photo.id])}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/dashboard/products/${product.id}`} className="truncate font-medium">
            {product.name || "Untitled product"}
          </Link>
          <span className="truncate font-mono text-[11px] text-subtle">{row.code}</span>
        </span>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2">
        <Swatch hex={variant.colourHex} className="size-3" />
        <span className="truncate">
          {variant.colourName}
          {variant.style && <span className="text-subtle"> · {variant.style}</span>}
        </span>
      </span>
      <span role="cell" className="font-mono text-[13px] font-medium">
        {size}
      </span>
      <span role="cell">
        <QtyStepper row={row} />
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
        <StatusBadge status={levelStatus[level]} />
      </span>
      <span role="cell" className="text-xs text-subtle">
        {formatDateTime(row.updatedAt)}
      </span>
      <span role="cell">
        <button
          type="button"
          onClick={onHistory}
          title="Stock history"
          aria-label={`Stock history for ${label}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <History className="size-4" />
        </button>
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
