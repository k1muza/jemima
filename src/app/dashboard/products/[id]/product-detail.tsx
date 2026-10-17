"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { useShallow } from "zustand/react/shallow";

import { ConfirmDialog } from "@/components/inventory/confirm-dialog";
import { MoneyInput } from "@/components/inventory/inputs";
import { buttonStyles, Segmented } from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { filterCatalogue } from "@/lib/inventory/catalogue";
import { formatMoney, formatPercent } from "@/lib/inventory/format";
import { margin } from "@/lib/inventory/stock";
import { CATEGORIES, type Product } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";
import { useDropTarget } from "@/providers/photo-upload-provider";

import { PhotosSection } from "./photos-section";
import { StockMatrix } from "./stock-matrix";

export function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useInventoryHydrated();
  const product = useInventory((s) => s.products.find((p) => p.id === id));

  if (!hydrated) return <DetailSkeleton />;
  if (!product) return <NotFound />;
  return <DetailContent product={product} />;
}

function DetailContent({ product }: { product: Product }) {
  const drop = useDropTarget(product.id);

  return (
    <div {...drop.props} className="-mt-6 flex flex-col md:-mt-10">
      <DetailBar product={product} />
      <div className="flex flex-col gap-11 pt-8">
        <div className="flex flex-wrap items-start gap-11">
          <div className="flex min-w-0 flex-[1.1_1_420px] flex-col">
            <PhotosSection product={product} />
          </div>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-10">
            <DetailsSection product={product} />
            <PricingSection product={product} />
          </div>
        </div>
        <StockMatrix product={product} />
      </div>
    </div>
  );
}

function DetailBar({ product }: { product: Product }) {
  const router = useRouter();
  const products = useInventory((s) => s.products);
  const { filter, search, threshold } = useInventory(
    useShallow((s) => ({ filter: s.filter, search: s.search, threshold: s.threshold })),
  );
  const deleteProduct = useInventory((s) => s.deleteProduct);

  // Step through the catalogue as it's currently filtered (or everything, if this product is filtered out).
  const filtered = filterCatalogue(products, filter, search, threshold);
  const order = (filtered.some((p) => p.id === product.id) ? filtered : products).map((p) => p.id);
  const index = order.indexOf(product.id);
  const go = (delta: number) => router.push(`/dashboard/products/${order[(index + delta + order.length) % order.length]}`);

  const navButton = "flex size-[34px] items-center justify-center rounded-lg border bg-card text-[15px] transition-colors hover:border-foreground";

  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/94 py-4 backdrop-blur-sm md:top-0">
      <div className="flex items-center gap-1.5">
        <Link href="/dashboard/products" className="py-1.5 pr-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground">
          ← All products
        </Link>
        <span className="mx-2 h-5 w-px bg-border" />
        <button type="button" onClick={() => go(-1)} title="Previous product" aria-label="Previous product" className={navButton}>
          ←
        </button>
        <button type="button" onClick={() => go(1)} title="Next product" aria-label="Next product" className={navButton}>
          →
        </button>
        <span className="ml-1.5 font-mono text-xs text-subtle">
          {index + 1} of {order.length}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-[7px] text-[13px] text-muted-foreground">
          <span className="size-[7px] rounded-full bg-[oklch(0.62_0.12_145)]" />
          Saved automatically
        </span>
        <ConfirmDialog
          trigger={
            <button type="button" className="p-1.5 text-[13px] text-muted-foreground hover:text-destructive">
              Delete
            </button>
          }
          title={`Delete ${product.name || "this product"}?`}
          description="Its photos and stock quantities will be removed from this browser."
          confirmLabel="Delete"
          onConfirm={() => {
            deleteProduct(product.id);
            router.push("/dashboard/products");
          }}
        />
      </div>
    </div>
  );
}

const fieldLabel = "flex flex-col gap-1.5 text-xs text-muted-foreground";
const fieldInput =
  "h-[38px] rounded-[9px] border bg-card px-3 text-sm text-foreground focus:border-foreground focus:outline-none";

function DetailsSection({ product }: { product: Product }) {
  const updateProduct = useInventory((s) => s.updateProduct);
  const setCategory = useInventory((s) => s.setCategory);

  return (
    <section className="flex flex-col gap-[18px]">
      <input
        value={product.name}
        onChange={(e) => updateProduct(product.id, { name: e.target.value })}
        placeholder="Name this product"
        aria-label="Product name"
        autoFocus={!product.name && !product.photos.length}
        className="w-full border-b bg-transparent pb-2.5 font-serif text-[40px] leading-[1.05] tracking-[-0.015em] focus:border-foreground focus:outline-none md:text-5xl"
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        <div className={fieldLabel}>
          Category
          <Segmented
            label="Category"
            value={product.category}
            onChange={(c) => setCategory(product.id, c)}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            className="flex-nowrap"
            itemClassName="flex-1 px-2.5 text-foreground"
          />
        </div>
        <label className={fieldLabel}>
          Type
          <input
            value={product.type}
            onChange={(e) => updateProduct(product.id, { type: e.target.value })}
            placeholder="e.g. Knitwear"
            className={fieldInput}
          />
        </label>
        <label className={fieldLabel}>
          SKU
          <input
            value={product.sku}
            onChange={(e) => updateProduct(product.id, { sku: e.target.value.toUpperCase() })}
            placeholder="e.g. KN-1040"
            className={cn(fieldInput, "font-mono text-[13px]")}
          />
        </label>
      </div>
    </section>
  );
}

function PricingSection({ product }: { product: Product }) {
  const updateProduct = useInventory((s) => s.updateProduct);
  const m = margin(product);
  const costShare = product.priceCents ? Math.min(100, (product.costCents / product.priceCents) * 100) : 0;
  const profitShare = product.priceCents ? Math.max(0, 100 - costShare) : 0;

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="font-serif text-[30px] font-normal">Pricing</h2>
      <div className="grid grid-cols-2 items-stretch gap-3.5 xl:grid-cols-3">
        <label className={fieldLabel}>
          Cost per unit
          <MoneyInput
            cents={product.costCents}
            onCents={(costCents) => updateProduct(product.id, { costCents })}
            className="h-12 rounded-[10px] px-3.5 text-lg"
            inputClassName="text-xl text-foreground"
          />
        </label>
        <label className={fieldLabel}>
          Selling price
          <MoneyInput
            cents={product.priceCents}
            onCents={(priceCents) => updateProduct(product.id, { priceCents })}
            className="h-12 rounded-[10px] px-3.5 text-lg"
            inputClassName="text-xl font-medium text-foreground"
          />
        </label>
        <div className="col-span-2 flex flex-col justify-end gap-2 xl:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn("font-serif text-4xl leading-none", m != null && m < 0 && "text-destructive")}>
              {formatPercent(m)}
            </span>
            <span className="text-xs text-subtle">
              {m == null ? "Set a price to see margin" : `${formatMoney(product.priceCents - product.costCents)} potential profit per unit`}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded bg-muted" aria-hidden>
            <div className="bg-[#b9afa1]" style={{ width: `${costShare}%` }} />
            <div className="bg-rose" style={{ width: `${profitShare}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-serif text-5xl">Product not found</h1>
      <p className="text-sm text-muted-foreground">It may have been deleted, or it was created in another browser.</p>
      <Link href="/dashboard/products" className={buttonStyles.outline}>
        ← All products
      </Link>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-10 w-80" />
      <div className="flex flex-wrap gap-11">
        <div className="grid flex-[1.1_1_420px] grid-cols-3 gap-3.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="aspect-4/5 rounded-[10px]" />
          ))}
        </div>
        <div className="flex flex-[1_1_380px] flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <Skeleton className="h-60 rounded-[14px]" />
    </div>
  );
}
