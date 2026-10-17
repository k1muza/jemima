"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { MoneyInput } from "@/components/inventory/inputs";
import {
  buttonStyles,
  PageHeader,
  Panel,
  PhotoFill,
  photoBackground,
  Segmented,
  StatusBadge,
  statusTextClass,
  Swatch,
} from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { colourDots, coverOf, FILTERS, filterCatalogue, matchesFilter, sortCatalogue, SORTS } from "@/lib/inventory/catalogue";
import { formatMoney, formatNumber, formatPercent, plural } from "@/lib/inventory/format";
import { margin, productStatus, productUnits, sumOf } from "@/lib/inventory/stock";
import type { Product } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useAccess, useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";
import { useDropTarget, usePhotoUpload } from "@/providers/photo-upload-provider";

export function Catalogue() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <CatalogueSkeleton />;
  return <CatalogueContent />;
}

function CatalogueContent() {
  const router = useRouter();
  const products = useInventory((s) => s.products);
  const threshold = useInventory((s) => s.threshold);
  const { filter, search, layout, sort, setFilter, setSearch, setLayout, setSort, createProduct, pruneEmptyProducts } =
    useInventory((s) => s);
  const { pick, dragging } = usePhotoUpload();
  const dropNew = useDropTarget("new");

  // Products abandoned before anything was entered are discarded on return.
  useEffect(() => pruneEmptyProducts(), [pruneEmptyProducts]);

  const list = sortCatalogue(filterCatalogue(products, filter, search, threshold), sort);
  const totalUnits = sumOf(products.map(productUnits));

  return (
    <>
      <PageHeader
        eyebrow={`${plural(products.length, "product")} · ${formatNumber(totalUnits)} units`}
        title="Products"
        actions={
          <>
            <button type="button" onClick={() => pick("new")} className={buttonStyles.outline}>
              Upload photos
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/products/${createProduct()}`)}
              className={buttonStyles.primary}
            >
              New product
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, SKU, type or colour"
          aria-label="Search products"
          className="h-10 max-w-[400px] flex-[1_1_260px] rounded-[9px] border bg-card px-3.5 text-sm focus:border-foreground focus:outline-none"
        />
        <Segmented
          label="Filter products"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f,
            label: f,
            count: products.filter((p) => matchesFilter(p, f, threshold)).length,
          }))}
        />
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="h-10 rounded-[9px] border bg-card px-3 text-sm text-foreground focus:border-foreground focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "Grid", label: "Grid" },
            { value: "List", label: "List" },
          ]}
        />
      </div>

      {dragging && (
        <div
          {...dropNew.props}
          className={cn(
            "flex flex-col gap-1.5 rounded-[14px] border-2 border-dashed border-rose bg-rose-soft p-[30px] text-center",
            dropNew.over && "bg-[oklch(0.93_0.04_25)]",
          )}
        >
          <span className="font-serif text-[30px]">Drop here to create a new product</span>
          <span className="text-[13px] text-muted-foreground">Or drop onto an existing product to add photos to it.</span>
        </div>
      )}

      {layout === "Grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} threshold={threshold} />
          ))}
        </div>
      ) : (
        list.length > 0 && <ProductTable products={list} threshold={threshold} />
      )}

      {!list.length && <div className="px-5 py-12 text-center text-sm text-subtle">No products match.</div>}
    </>
  );
}

function ProductCard({ product, threshold }: { product: Product; threshold: number }) {
  const images = useInventory((s) => s.images);
  const drop = useDropTarget(product.id);
  const status = productStatus(product, threshold);
  const cover = coverOf(product, images);
  const units = productUnits(product);
  const photoCount = product.photos.length;

  return (
    <Link
      href={`/dashboard/products/${product.id}`}
      {...drop.props}
      className="group flex min-w-0 flex-col gap-3 hover:text-foreground"
    >
      <PhotoFill
        hex={cover.hex}
        imageUrl={cover.imageUrl}
        label={photoCount ? "sample photo" : "no photos yet"}
        className={cn(
          "aspect-4/5 rounded-[14px] transition-shadow group-hover:shadow-[0_12px_30px_rgba(26,23,20,.14)]",
          drop.over && "ring-3 ring-rose",
        )}
      >
        {status !== "In stock" && <StatusBadge status={status} className="absolute top-2.5 left-2.5 font-semibold" />}
        <span className="absolute top-2.5 right-2.5 rounded-full bg-primary/55 px-2 py-[3px] font-mono text-[11px] text-primary-foreground">
          {plural(photoCount, "photo")}
        </span>
        {product.variants.length > 0 && (
          <span className="absolute bottom-2.5 left-2.5 flex gap-1 rounded-full bg-card/92 p-[5px]">
            {colourDots(product).map((d) => (
              <Swatch key={d.name} hex={d.hex} title={d.name} />
            ))}
          </span>
        )}
        {drop.over && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/60 font-serif text-2xl text-primary-foreground">
            Add photos here
          </span>
        )}
      </PhotoFill>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[15px] font-medium">{product.name || "Untitled product"}</span>
          <span className="text-xs text-subtle">{[product.type, product.category].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[3px]">
          <span className="font-serif text-[22px] leading-none">
            {product.priceCents ? formatMoney(product.priceCents) : "No price"}
          </span>
          <span className={cn("text-xs tabular-nums", statusTextClass[status])}>
            {units ? `${formatNumber(units)} in stock` : "None in stock"}
          </span>
        </div>
      </div>
    </Link>
  );
}

const TABLE_COLUMNS = "grid-cols-[44px_minmax(220px,2fr)_84px_110px_70px_120px_120px_64px_104px]";

function ProductTable({ products, threshold }: { products: Product[]; threshold: number }) {
  return (
    <Panel className="overflow-x-auto">
      <div className="min-w-[1020px]" role="table" aria-label="Products">
        <div role="row" className={cn("grid gap-4 border-b px-5 py-3 text-xs text-subtle", TABLE_COLUMNS)}>
          <span role="columnheader" />
          <span role="columnheader">Product</span>
          <span role="columnheader">Category</span>
          <span role="columnheader">Colours</span>
          <span role="columnheader" className="text-right">
            Units
          </span>
          <span role="columnheader">Cost</span>
          <span role="columnheader">Price</span>
          <span role="columnheader" className="text-right">
            Margin
          </span>
          <span role="columnheader">Status</span>
        </div>
        {products.map((p) => (
          <ProductRow key={p.id} product={p} threshold={threshold} />
        ))}
      </div>
    </Panel>
  );
}

function ProductRow({ product, threshold }: { product: Product; threshold: number }) {
  const router = useRouter();
  const images = useInventory((s) => s.images);
  const updateProduct = useInventory((s) => s.updateProduct);
  const access = useAccess();
  const drop = useDropTarget(product.id);
  const status = productStatus(product, threshold);
  const cover = coverOf(product, images);
  const href = `/dashboard/products/${product.id}`;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="row"
      {...drop.props}
      onClick={() => router.push(href)}
      className={cn(
        "grid cursor-pointer items-center gap-4 border-b border-line-soft px-5 py-[9px] text-sm transition-colors hover:bg-[#faf7f2]",
        TABLE_COLUMNS,
        drop.over && "bg-rose-soft",
      )}
    >
      <span role="cell" className="h-[54px] w-11 overflow-hidden rounded-md" style={photoBackground(cover.hex, cover.imageUrl)} />
      <span role="cell" className="flex min-w-0 flex-col gap-[3px]">
        <Link href={href} onClick={stop} className="truncate font-medium">
          {product.name || "Untitled product"}
        </Link>
        <span className="font-mono text-[11px] text-subtle">
          {product.sku || "no SKU"} · {product.type || "—"}
        </span>
      </span>
      <span role="cell" className="text-muted-foreground">
        {product.category}
      </span>
      <span role="cell" className="flex flex-wrap gap-1">
        {colourDots(product).map((d) => (
          <Swatch key={d.name} hex={d.hex} title={d.name} />
        ))}
      </span>
      <span role="cell" className={cn("text-right font-medium tabular-nums", statusTextClass[status])}>
        {formatNumber(productUnits(product))}
      </span>
      <span role="cell" onClick={stop}>
        {!access.canViewCosts ? (
          <span className="text-subtle">Hidden</span>
        ) : (
          <MoneyInput
            disabled={!access.canEditPrices}
            cents={product.costCents}
            onCents={(costCents) => updateProduct(product.id, { costCents })}
            aria-label={`Cost of ${product.name}`}
            className="h-[34px] rounded-[7px] px-2.5"
            inputClassName="text-sm"
          />
        )}
      </span>
      <span role="cell" onClick={stop}>
        <MoneyInput
          disabled={!access.canEditPrices}
          cents={product.priceCents}
          onCents={(priceCents) => updateProduct(product.id, { priceCents })}
          aria-label={`Price of ${product.name}`}
          className="h-[34px] rounded-[7px] px-2.5"
          inputClassName="text-sm font-medium"
        />
      </span>
      <span role="cell" className="text-right text-muted-foreground tabular-nums">
        {access.canViewCosts ? formatPercent(margin(product)) : "—"}
      </span>
      <span role="cell">
        <StatusBadge status={status} />
      </span>
    </div>
  );
}

function CatalogueSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-7">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-4/5 rounded-[14px]" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </>
  );
}
