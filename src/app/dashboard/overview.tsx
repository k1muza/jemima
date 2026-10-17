"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { QtyInput } from "@/components/inventory/inputs";
import {
  cellLevelClasses,
  cellLevelLabel,
  PageHeader,
  Panel,
  PanelTitle,
  photoBackground,
  Swatch,
} from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatNumber, formatPercent, plural } from "@/lib/inventory/format";
import {
  cellLevel,
  lowCells,
  margin,
  productIssues,
  productUnits,
  qtyOf,
  sumOf,
  variantUnits,
} from "@/lib/inventory/stock";
import { CATEGORIES } from "@/lib/inventory/types";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

const RESTOCK_LIMIT = 10;

export function Overview() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <OverviewSkeleton />;
  return <OverviewContent />;
}

function OverviewContent() {
  const products = useInventory((s) => s.products);
  const threshold = useInventory((s) => s.threshold);
  const images = useInventory((s) => s.images);
  const setQty = useInventory((s) => s.setQty);
  // Rows edited this visit stay put even once they rise above the threshold.
  const [kept, setKept] = useState<string[]>([]);

  const today = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(new Date()),
    [],
  );

  const stats = useMemo(() => {
    const totalUnits = sumOf(products.map(productUnits));
    const lowCount = sumOf(products.map((p) => lowCells(p, threshold).length));
    const margins = products.map(margin).filter((m): m is number => m != null);
    const average = (xs: number[]) => (xs.length ? sumOf(xs) / xs.length : null);

    const kpis = [
      {
        label: "Units in stock",
        value: formatNumber(totalUnits),
        sub: `${plural(products.length, "product")} in ${plural(sumOf(products.map((p) => p.variants.length)), "colour/style row")}`,
      },
      {
        label: "Stock value at cost",
        value: formatMoney(sumOf(products.map((p) => productUnits(p) * p.costCents))),
        sub: "What you paid for what is on the shelf",
      },
      {
        label: "Retail value",
        value: formatMoney(sumOf(products.map((p) => productUnits(p) * p.priceCents))),
        sub: "Potential, if everything sold at full price",
      },
      {
        label: "Average margin",
        value: formatPercent(average(margins)),
        sub: `Potential · ${plural(lowCount, "size")} low on stock`,
      },
    ];

    const colourTotals = new Map<string, { name: string; hex: string; units: number }>();
    for (const p of products) {
      for (const v of p.variants) {
        const key = v.colourName.trim().toLowerCase() || "unnamed";
        const entry = colourTotals.get(key) ?? { name: v.colourName || "Unnamed", hex: v.colourHex, units: 0 };
        entry.units += variantUnits(p, v);
        colourTotals.set(key, entry);
      }
    }
    const colours = [...colourTotals.values()].filter((c) => c.units > 0).sort((a, b) => b.units - a.units);

    const categories = CATEGORIES.map((name) => {
      const inCategory = products.filter((p) => p.category === name);
      const units = sumOf(inCategory.map(productUnits));
      return {
        name,
        units,
        share: totalUnits ? (units / totalUnits) * 100 : 0,
        retail: formatMoney(sumOf(inCategory.map((p) => productUnits(p) * p.priceCents))),
        margin: formatPercent(average(inCategory.map(margin).filter((m): m is number => m != null))),
      };
    });

    const attention = products
      .map((p) => ({ id: p.id, name: p.name || "Untitled product", issues: productIssues(p) }))
      .filter((p) => p.issues.length);

    return { kpis, colours, categories, attention, lowCount };
  }, [products, threshold]);

  const restock = products
    .flatMap((p) =>
      p.variants.flatMap((v) =>
        p.sizes
          .filter((size) => qtyOf(v, size) <= threshold || kept.includes(`${p.id}|${v.id}|${size}`))
          .map((size) => {
            const photo = p.photos.find((ph) => ph.variantId === v.id) ?? p.photos[0];
            return { key: `${p.id}|${v.id}|${size}`, product: p, variant: v, size, photoUrl: photo && images[photo.id] };
          }),
      ),
    )
    .sort((a, b) => (a.product.name + a.variant.colourName).localeCompare(b.product.name + b.variant.colourName))
    .slice(0, RESTOCK_LIMIT);

  return (
    <>
      <PageHeader eyebrow={today} title="Overview" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {stats.kpis.map((k) => (
          <Panel key={k.label} className="flex flex-col gap-3.5 px-[22px] py-5">
            <div className="text-[13px] text-muted-foreground">{k.label}</div>
            <div className="font-serif text-5xl leading-none tracking-[-0.01em]">{k.value}</div>
            <div className="text-xs text-subtle">{k.sub}</div>
          </Panel>
        ))}
      </div>

      <Panel className="flex flex-col gap-[18px] p-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <PanelTitle>Stock by colour</PanelTitle>
          <span className="text-xs text-subtle">Colours detected from product photos</span>
        </div>
        <div className="flex h-10 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label="Units in stock by colour">
          {stats.colours.map((c) => (
            <div
              key={c.name}
              title={`${c.name} · ${formatNumber(c.units)} units`}
              className="min-w-1"
              style={{ flex: c.units, background: c.hex }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {stats.colours.slice(0, 12).map((c) => (
            <li key={c.name} className="flex items-center gap-2 text-[13px]">
              <Swatch hex={c.hex} className="size-3" />
              <span className="font-medium">{c.name}</span>
              <span className="text-subtle tabular-nums">{formatNumber(c.units)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="flex flex-wrap items-start gap-3.5">
        <Panel className="min-w-0 flex-[1.5_1_460px]">
          <div className="flex items-baseline justify-between gap-3 px-[22px] pt-[22px] pb-1.5">
            <PanelTitle>Restock</PanelTitle>
            <span className="text-xs text-subtle">
              {plural(stats.lowCount, "size")} at {threshold} or fewer
            </span>
          </div>
          <div className="px-[22px] pb-3 text-xs text-subtle">Type the new quantity straight into the box.</div>
          {restock.map(({ key, product, variant, size, photoUrl }) => {
            const qty = qtyOf(variant, size);
            const level = cellLevel(qty, threshold);
            const href = `/dashboard/products/${product.id}`;
            return (
              <div
                key={key}
                className="grid grid-cols-[40px_minmax(0,1fr)_52px_72px] items-center gap-3.5 border-t border-line-soft px-[22px] py-2.5"
              >
                <Link
                  href={href}
                  aria-label={`Open ${product.name || "product"}`}
                  className="h-12 w-10 overflow-hidden rounded-md"
                  style={photoBackground(variant.colourHex, photoUrl)}
                />
                <Link href={href} className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{product.name || "Untitled"}</span>
                  <span className="flex items-center gap-1.5 text-xs text-subtle">
                    <Swatch hex={variant.colourHex} className="size-[9px]" />
                    {variant.colourName}
                    {variant.style && ` · ${variant.style}`}
                  </span>
                </Link>
                <span className="font-mono text-[13px] font-medium">{size}</span>
                <QtyInput
                  value={variant.qty[size] ?? null}
                  onValue={(next) => {
                    if (!kept.includes(key)) setKept((k) => [...k, key]);
                    setQty(product.id, variant.id, size, next);
                  }}
                  aria-label={`${product.name} ${variant.colourName} size ${size}, ${cellLevelLabel[level]}`}
                  className={`h-9 w-[72px] ${cellLevelClasses[level]}`}
                />
              </div>
            );
          })}
          {!restock.length && (
            <div className="border-t border-line-soft px-[22px] py-7 text-sm text-subtle">Every size is above the threshold.</div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <Panel>
            <PanelTitle className="px-[22px] pt-[22px] pb-3">Needs details</PanelTitle>
            {stats.attention.map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/products/${a.id}`}
                className="flex items-center justify-between gap-3 border-t border-line-soft px-[22px] py-3 transition-colors hover:bg-[#faf7f2] hover:text-foreground"
              >
                <span className="min-w-0 truncate text-sm font-medium">{a.name}</span>
                <span className="flex shrink-0 gap-1">
                  {a.issues.map((issue) => (
                    <span key={issue} className="rounded-full bg-out-bg px-2 py-[3px] text-[11px] font-medium text-out-fg">
                      {issue}
                    </span>
                  ))}
                </span>
              </Link>
            ))}
            {!stats.attention.length && (
              <div className="border-t border-line-soft px-[22px] py-5 text-sm text-subtle">
                Every product has photos, a price and a SKU.
              </div>
            )}
          </Panel>

          <Panel className="flex flex-col gap-5 p-[22px]">
            <PanelTitle>By category</PanelTitle>
            {stats.categories.map((c) => (
              <div key={c.name} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-[13px] text-muted-foreground tabular-nums">{formatNumber(c.units)} units</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-line-soft">
                  <div className="h-full rounded bg-primary" style={{ width: `${c.share}%` }} />
                </div>
                <div className="flex justify-between text-xs text-subtle">
                  <span>{c.retail} retail</span>
                  <span>{c.margin} avg margin</span>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-72" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[146px] rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-[170px] rounded-[14px]" />
      <Skeleton className="h-[420px] rounded-[14px]" />
    </>
  );
}
