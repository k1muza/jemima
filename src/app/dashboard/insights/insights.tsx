"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { buttonStyles, PageHeader, Panel, PanelTitle, Segmented, Swatch } from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { csvDate, csvMoney, downloadCsv } from "@/lib/inventory/csv";
import { formatMoney, formatNumber, formatPercent, plural } from "@/lib/inventory/format";
import { productUnits, qtyOf, sumOf } from "@/lib/inventory/stock";
import { CATEGORIES, type Product } from "@/lib/inventory/types";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

type Totals = { units: number; cost: number; retail: number };

const totalsOf = (products: Product[]): Totals =>
  products.reduce(
    (t, p) => {
      const u = productUnits(p);
      return { units: t.units + u, cost: t.cost + u * p.costCents, retail: t.retail + u * p.priceCents };
    },
    { units: 0, cost: 0, retail: 0 },
  );

/** Potential margin of a stock pool; null when there is no retail value. */
const poolMargin = (t: Totals) => (t.retail > 0 ? (t.retail - t.cost) / t.retail : null);

export function Insights() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <InsightsSkeleton />;
  return <InsightsContent />;
}

function InsightsContent() {
  const products = useInventory((s) => s.products);
  const threshold = useInventory((s) => s.threshold);
  const [rankBy, setRankBy] = useState<"units" | "cost">("units");

  const data = useMemo(() => {
    const total = totalsOf(products);
    const skus = products.flatMap((p) => p.variants.flatMap((v) => p.sizes.map((size) => ({ p, v, size, qty: qtyOf(v, size) }))));

    const groups = CATEGORIES.map((category) => {
      const inCategory = products.filter((p) => p.category === category);
      const types = [...new Set(inCategory.map((p) => p.type || "Untyped"))]
        .map((type) => ({ type, ...totalsOf(inCategory.filter((p) => (p.type || "Untyped") === type)) }))
        .sort((a, b) => b.cost - a.cost);
      return { category, ...totalsOf(inCategory), types };
    });

    const missing = products
      .flatMap((p) =>
        p.variants.map((v) => ({
          product: p,
          variant: v,
          sizes: p.sizes.filter((size) => qtyOf(v, size) === 0),
        })),
      )
      .filter((m) => m.sizes.length);

    return {
      total,
      counts: {
        products: products.length,
        variants: sumOf(products.map((p) => p.variants.length)),
        skus: skus.length,
        units: total.units,
      },
      groups,
      maxTypeCost: Math.max(1, ...groups.flatMap((g) => g.types.map((t) => t.cost))),
      soldOut: skus.filter((s) => s.qty === 0).length,
      low: skus.filter((s) => s.qty > 0 && s.qty <= threshold).length,
      missing,
    };
  }, [products, threshold]);

  const ranked = products
    .map((p) => ({ product: p, units: productUnits(p), cost: productUnits(p) * p.costCents }))
    .sort((a, b) => b[rankBy] - a[rankBy])
    .slice(0, 8);
  const maxRank = Math.max(1, ...ranked.map((r) => r[rankBy]));

  const exportCsv = () =>
    downloadCsv(
      `valuation-${csvDate()}.csv`,
      ["Category", "Type", "Units", "Stock at cost (USD)", "Potential retail (USD)", "Potential gross profit (USD)", "Potential margin %"],
      data.groups.flatMap((g) =>
        g.types.map((t) => [
          g.category,
          t.type,
          t.units,
          csvMoney(t.cost),
          csvMoney(t.retail),
          csvMoney(t.retail - t.cost),
          poolMargin(t) == null ? "" : (poolMargin(t)! * 100).toFixed(1),
        ]),
      ),
    );

  const { total } = data;
  const tiles = [
    { label: "Stock at cost", value: formatMoney(total.cost), sub: "Units on hand × current unit cost" },
    { label: "Potential retail value", value: formatMoney(total.retail), sub: "If everything sold at full price" },
    { label: "Potential gross profit", value: formatMoney(total.retail - total.cost), sub: "Retail value minus stock at cost" },
    { label: "Potential margin", value: formatPercent(poolMargin(total)), sub: "Weighted by units on hand" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Current stock only · no sales data"
        title="Insights"
        actions={
          <button type="button" onClick={exportCsv} className={buttonStyles.outline}>
            Export valuation CSV
          </button>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {tiles.map((k) => (
          <Panel key={k.label} className="flex flex-col gap-3.5 px-[22px] py-5">
            <div className="text-[13px] text-muted-foreground">{k.label}</div>
            <div className="font-serif text-5xl leading-none tracking-[-0.01em]">{k.value}</div>
            <div className="text-xs text-subtle">{k.sub}</div>
          </Panel>
        ))}
      </div>

      <Panel className="grid grid-cols-2 divide-line-soft sm:grid-cols-4 sm:divide-x">
        {[
          ["Products", data.counts.products],
          ["Colour/style rows", data.counts.variants],
          ["Items (SKUs)", data.counts.skus],
          ["Units", data.counts.units],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 px-[22px] py-4">
            <span className="text-xs text-subtle">{label}</span>
            <span className="font-serif text-[32px] leading-none">{formatNumber(value as number)}</span>
          </div>
        ))}
      </Panel>

      <Panel className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-[22px] pt-[22px] pb-4">
          <PanelTitle>Value by category</PanelTitle>
          <span className="text-xs text-subtle">Bars show stock at cost</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-y text-left text-xs text-subtle">
                <th className="px-[22px] py-2.5 font-normal">Type</th>
                <th className="py-2.5 pr-4 text-right font-normal">Units</th>
                <th className="w-[30%] py-2.5 pr-4 font-normal">Stock at cost</th>
                <th className="py-2.5 pr-4 text-right font-normal">Potential retail</th>
                <th className="py-2.5 pr-4 text-right font-normal">Potential profit</th>
                <th className="py-2.5 pr-[22px] text-right font-normal">Potential margin</th>
              </tr>
            </thead>
            {data.groups.map((g) => (
              <tbody key={g.category}>
                <tr className="bg-secondary/60 font-medium">
                  <th scope="rowgroup" className="px-[22px] py-2.5 text-left">{g.category}</th>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{formatNumber(g.units)}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{formatMoney(g.cost)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(g.retail)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(g.retail - g.cost)}</td>
                  <td className="py-2.5 pr-[22px] text-right tabular-nums">{formatPercent(poolMargin(g))}</td>
                </tr>
                {g.types.map((t) => (
                  <tr key={t.type} className="border-t border-line-soft">
                    <th scope="row" className="px-[22px] py-2.5 text-left font-normal">{t.type}</th>
                    <td className="py-2.5 pr-4 text-right text-muted-foreground tabular-nums">{formatNumber(t.units)}</td>
                    <td className="py-2.5 pr-4">
                      <Bar
                        value={t.cost}
                        max={data.maxTypeCost}
                        label={`${g.category} · ${t.type}`}
                        detail={`${formatMoney(t.cost)} at cost · ${plural(t.units, "unit")}`}
                        display={formatMoney(t.cost)}
                      />
                    </td>
                    <td className="py-2.5 pr-4 text-right text-muted-foreground tabular-nums">{formatMoney(t.retail)}</td>
                    <td className="py-2.5 pr-4 text-right text-muted-foreground tabular-nums">{formatMoney(t.retail - t.cost)}</td>
                    <td className="py-2.5 pr-[22px] text-right text-muted-foreground tabular-nums">{formatPercent(poolMargin(t))}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>

      <div className="flex flex-wrap items-start gap-3.5">
        <Panel className="flex min-w-0 flex-[1.3_1_420px] flex-col gap-4 p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PanelTitle>Most heavily stocked</PanelTitle>
            <Segmented
              label="Rank by"
              value={rankBy}
              onChange={setRankBy}
              options={[
                { value: "units", label: "Units" },
                { value: "cost", label: "Stock at cost" },
              ]}
            />
          </div>
          <p className="-mt-2 text-xs text-subtle">Where your money is sitting on the shelf, not best sellers.</p>
          <ol className="flex flex-col gap-3">
            {ranked.map(({ product, units, cost }) => {
              const value = rankBy === "units" ? units : cost;
              const display = rankBy === "units" ? formatNumber(units) : formatMoney(cost);
              return (
                <li key={product.id} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] items-center gap-4 text-sm">
                  <Link href={`/dashboard/products/${product.id}`} className="truncate font-medium">
                    {product.name || "Untitled product"}
                  </Link>
                  <Bar
                    value={value}
                    max={maxRank}
                    label={product.name}
                    detail={`${plural(units, "unit")} · ${formatMoney(cost)} at cost`}
                    display={display}
                  />
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <Panel className="grid grid-cols-2 divide-x divide-line-soft">
            <Link href="/dashboard/inventory" className="flex flex-col gap-1 px-[22px] py-5 hover:bg-[#faf7f2] hover:text-foreground">
              <span className="flex items-center gap-1.5 text-xs text-out-fg">
                <span className="size-2 rounded-full bg-out-fg" aria-hidden />
                Sold out
              </span>
              <span className="font-serif text-4xl leading-none">{formatNumber(data.soldOut)}</span>
              <span className="text-xs text-subtle">items at 0</span>
            </Link>
            <Link href="/dashboard/inventory" className="flex flex-col gap-1 px-[22px] py-5 hover:bg-[#faf7f2] hover:text-foreground">
              <span className="flex items-center gap-1.5 text-xs text-low-fg">
                <span className="size-2 rounded-full bg-low-fg" aria-hidden />
                Low stock
              </span>
              <span className="font-serif text-4xl leading-none">{formatNumber(data.low)}</span>
              <span className="text-xs text-subtle">items at 1–{threshold}</span>
            </Link>
          </Panel>

          <Panel>
            <div className="flex items-baseline justify-between gap-3 px-[22px] pt-[22px] pb-3">
              <PanelTitle>Missing sizes</PanelTitle>
              <span className="text-xs text-subtle">{plural(data.missing.length, "colour row")}</span>
            </div>
            <ul className="max-h-[360px] overflow-y-auto">
              {data.missing.map(({ product, variant, sizes }) => (
                <li key={variant.id} className="border-t border-line-soft">
                  <Link
                    href={`/dashboard/products/${product.id}`}
                    className="flex items-center justify-between gap-3 px-[22px] py-2.5 hover:bg-[#faf7f2] hover:text-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Swatch hex={variant.colourHex} className="size-3" />
                      <span className="truncate">
                        <span className="font-medium">{product.name}</span>
                        <span className="text-subtle"> · {variant.colourName}{variant.style && ` ${variant.style}`}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-out-fg">
                      {sizes.length === product.sizes.length ? "all sizes" : sizes.join(" ")}
                    </span>
                  </Link>
                </li>
              ))}
              {!data.missing.length && (
                <li className="border-t border-line-soft px-[22px] py-5 text-sm text-subtle">Every colour has every size in stock.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>

      <p className="text-xs leading-normal text-subtle">
        Figures use each product&apos;s current unit cost and selling price. Profit and margin are <em>potential</em>: there are no
        sales records, so nothing here is realised revenue or earnings.
      </p>
    </>
  );
}

/** Single-measure horizontal bar: thin, rounded data end, recessive track, value as text beside it. */
function Bar({ value, max, label, detail, display }: { value: number; max: number; label: string; detail: string; display: string }) {
  const pct = Math.max(0, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex h-5 flex-1 items-center" aria-label={`${label}: ${detail}`} role="img" />
          }
        >
          <div className="h-2 w-full overflow-hidden rounded-r bg-line-soft">
            <div className="h-full rounded-r bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <span className="font-medium">{label}</span> · {detail}
        </TooltipContent>
      </Tooltip>
      <span className="w-[76px] shrink-0 text-right text-[13px] tabular-nums">{display}</span>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-14 w-72" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[146px] rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[14px]" />
    </>
  );
}
