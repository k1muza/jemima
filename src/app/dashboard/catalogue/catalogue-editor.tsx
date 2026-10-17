"use client";

import Link from "next/link";
import { useEffect, useMemo, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/inventory/confirm-dialog";
import { buttonStyles, PageHeader, Panel, PhotoFill, Segmented, Swatch } from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  catalogueItems,
  colourOptions,
  filterForEditor,
  pageCount,
  selectedIds,
} from "@/lib/catalogue/model";
import { coverOf } from "@/lib/inventory/catalogue";
import { formatMoney, formatNumber, plural } from "@/lib/inventory/format";
import { productUnits } from "@/lib/inventory/stock";
import type { Catalogue, CataloguePageLayout, Category } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

import { useCatalogueExport } from "./use-catalogue-export";

const inputClass =
  "h-10 rounded-[9px] border bg-card px-3 text-[15px] text-foreground focus:border-foreground focus:outline-none";

export function CatalogueEditor() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <CatalogueSkeleton />;
  return <EditorContent />;
}

/** The catalogue open in the editor; creates the first one on a first visit. */
export function useActiveCatalogue() {
  const catalogues = useInventory((s) => s.catalogues);
  const activeId = useInventory((s) => s.activeCatalogueId);
  const ensureCatalogue = useInventory((s) => s.ensureCatalogue);
  useEffect(() => ensureCatalogue(), [catalogues.length, ensureCatalogue]);
  return catalogues.find((c) => c.id === activeId) ?? catalogues[0];
}

function EditorContent() {
  const catalogue = useActiveCatalogue();
  if (!catalogue) return <CatalogueSkeleton />;
  return <Editor catalogue={catalogue} />;
}

function Editor({ catalogue }: { catalogue: Catalogue }) {
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const items = useMemo(() => catalogueItems(catalogue, products, images), [catalogue, products, images]);
  const pages = pageCount(catalogue, items);
  const { busy, downloadPdf, downloadWeb } = useCatalogueExport(catalogue);
  const empty = !items.length;

  return (
    <>
      <PageHeader
        eyebrow={`${plural(items.length, "product")} · ${plural(pages, "page")}`}
        title="Catalogue"
        actions={
          <>
            <button type="button" onClick={downloadPdf} disabled={empty || !!busy} className={buttonStyles.outline}>
              {busy === "pdf" ? "Making PDF…" : "Download PDF"}
            </button>
            <button type="button" onClick={downloadWeb} disabled={empty || !!busy} className={buttonStyles.outline}>
              {busy === "web" ? "Making web page…" : "Download web page"}
            </button>
            <Link href={`/dashboard/catalogue/${catalogue.id}`} className={buttonStyles.primary}>
              Open web page →
            </Link>
          </>
        }
      />

      <CatalogueTabs activeId={catalogue.id} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-4">
        <div className="flex flex-col gap-4">
          <DetailsPanel catalogue={catalogue} />
          <LayoutPanel catalogue={catalogue} />
        </div>
        <ProductsPanel catalogue={catalogue} />
      </div>
    </>
  );
}

function CatalogueTabs({ activeId }: { activeId: string }) {
  const catalogues = useInventory((s) => s.catalogues);
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const { setActiveCatalogue, createCatalogue } = useInventory((s) => s);

  return (
    <div role="tablist" aria-label="Catalogues" className="flex gap-2.5 overflow-x-auto pb-1">
      {catalogues.map((c) => {
        const on = c.id === activeId;
        const ids = new Set(selectedIds(c, products));
        const shown = products.filter((p) => ids.has(p.id) && (!c.hideSoldOut || productUnits(p) > 0));
        const cover = shown[0] ? coverOf(shown[0], images) : null;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setActiveCatalogue(c.id)}
            className={cn(
              "flex min-w-[180px] shrink-0 items-center gap-3 rounded-xl border py-2.5 pr-4 pl-2.5 text-left transition-colors",
              on ? "border-primary bg-primary text-sidebar-foreground" : "bg-card hover:border-foreground",
            )}
          >
            <PhotoFill hex={cover?.hex ?? "#ebe5db"} imageUrl={cover?.imageUrl} className="h-[42px] w-[34px] shrink-0 rounded-[5px]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="max-w-[200px] truncate text-sm font-semibold">{c.name || "Untitled catalogue"}</span>
              <span className="text-xs opacity-70">{plural(shown.length, "product")}</span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => createCatalogue({ name: "New catalogue", title: "New catalogue", subtitle: "", productIds: [] })}
        className="min-w-[150px] shrink-0 rounded-xl border-[1.5px] border-dashed border-[#cfc6b8] px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        + New catalogue
      </button>
    </div>
  );
}

function PanelHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-serif text-2xl font-normal">{children}</h2>
      {aside}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

const linkButton = "text-xs font-medium text-muted-foreground transition-colors hover:text-foreground";

function DetailsPanel({ catalogue }: { catalogue: Catalogue }) {
  const products = useInventory((s) => s.products);
  const canDelete = useInventory((s) => s.catalogues.length > 1);
  const { updateCatalogue, createCatalogue, deleteCatalogue } = useInventory((s) => s);
  const update = (patch: Partial<Catalogue>) => updateCatalogue(catalogue.id, patch);

  const duplicate = () => {
    createCatalogue({
      ...catalogue,
      name: `${catalogue.name || "Catalogue"} copy`,
      productIds: selectedIds(catalogue, products),
    });
  };

  return (
    <Panel className="flex flex-col gap-3.5 p-5">
      <PanelHeading
        aside={
          <span className="flex gap-3">
            <button type="button" onClick={duplicate} className={linkButton}>
              Duplicate
            </button>
            {canDelete && (
              <ConfirmDialog
                trigger={
                  <button type="button" className={cn(linkButton, "hover:text-out-fg")}>
                    Delete
                  </button>
                }
                title={`Delete the ${catalogue.name || "untitled"} catalogue?`}
                description="Products are not affected."
                confirmLabel="Delete"
                onConfirm={() => deleteCatalogue(catalogue.id)}
              />
            )}
          </span>
        }
      >
        Details
      </PanelHeading>
      <Field label="Catalogue name (only you see this)">
        <input
          value={catalogue.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. Girls"
          maxLength={120}
          className={cn(inputClass, "font-medium")}
        />
      </Field>
      <Field label="Title on the catalogue">
        <input
          value={catalogue.title}
          onChange={(e) => update({ title: e.target.value })}
          maxLength={200}
          className={inputClass}
        />
      </Field>
      <Field label="Subtitle">
        <input
          value={catalogue.subtitle}
          onChange={(e) => update({ subtitle: e.target.value })}
          placeholder="Optional"
          maxLength={400}
          className={cn(inputClass, "text-sm")}
        />
      </Field>
    </Panel>
  );
}

const LAYOUTS: { value: CataloguePageLayout; label: string }[] = [
  { value: "Grid", label: "Grid · 6 per page" },
  { value: "Feature", label: "One per page" },
];

const TOGGLES: { key: "cover" | "showPrices" | "showColours" | "hideSoldOut"; label: string }[] = [
  { key: "cover", label: "Cover page" },
  { key: "showPrices", label: "Show prices" },
  { key: "showColours", label: "Show colours" },
  { key: "hideSoldOut", label: "Leave out sold-out items" },
];

function LayoutPanel({ catalogue }: { catalogue: Catalogue }) {
  const updateCatalogue = useInventory((s) => s.updateCatalogue);

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <PanelHeading>Layout</PanelHeading>
      <Segmented
        label="Page layout"
        options={LAYOUTS}
        value={catalogue.layout}
        onChange={(layout) => updateCatalogue(catalogue.id, { layout })}
        itemClassName="flex-1 whitespace-nowrap"
      />
      <div className="flex flex-col">
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm">
            {label}
            <Switch checked={catalogue[key]} onCheckedChange={(on) => updateCatalogue(catalogue.id, { [key]: on })} />
          </label>
        ))}
      </div>
    </Panel>
  );
}

const DEPARTMENTS: { value: "All" | Category; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Clothing", label: "Clothing" },
  { value: "Shoes", label: "Shoes" },
];

function ProductsPanel({ catalogue }: { catalogue: Catalogue }) {
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const updateCatalogue = useInventory((s) => s.updateCatalogue);
  const update = (patch: Partial<Catalogue>) => updateCatalogue(catalogue.id, patch);

  const selected = selectedIds(catalogue, products);
  const selectedSet = new Set(selected);
  const shown = filterForEditor(catalogue, products);
  const colours = useMemo(() => colourOptions(products), [products]);
  const selectedCount = selected.filter((id) => products.some((p) => p.id === id)).length;

  const toggle = (id: string) =>
    update({ productIds: selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  const toggleColour = (key: string) =>
    update({
      colourFilter: catalogue.colourFilter.includes(key)
        ? catalogue.colourFilter.filter((c) => c !== key)
        : [...catalogue.colourFilter, key],
    });

  return (
    <Panel className="flex flex-col">
      <div className="flex flex-col gap-3 px-5 pt-5 pb-3">
        <PanelHeading aside={<span className="text-xs text-subtle">{formatNumber(selectedCount)} selected</span>}>
          Products
        </PanelHeading>
        <Segmented
          label="Department"
          options={DEPARTMENTS}
          value={catalogue.department}
          onChange={(department) => update({ department })}
          itemClassName="flex-1"
        />
        {colours.length > 0 && (
          <div role="group" aria-label="Colour" className="flex flex-wrap gap-[5px]">
            {colours.map((c) => {
              const on = catalogue.colourFilter.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleColour(c.key)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-1.5 text-xs transition-colors",
                    on ? "border-foreground bg-secondary" : "bg-card hover:border-foreground",
                  )}
                >
                  <Swatch hex={c.hex} />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-3.5 text-[13px] font-medium">
          <button
            type="button"
            onClick={() => update({ productIds: [...new Set([...selected, ...shown.map((p) => p.id)])] })}
            className="underline underline-offset-[3px]"
          >
            Select all shown
          </button>
          <button
            type="button"
            onClick={() => {
              const hidden = new Set(shown.map((p) => p.id));
              update({ productIds: selected.filter((id) => !hidden.has(id)) });
            }}
            className="text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
          >
            Clear shown
          </button>
        </div>
      </div>
      <div className="max-h-[560px] overflow-y-auto border-t border-line-soft">
        {shown.map((p) => {
          const on = selectedSet.has(p.id);
          const units = productUnits(p);
          const cover = coverOf(p, images);
          return (
            <button
              key={p.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(p.id)}
              className="grid w-full grid-cols-[20px_30px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line-soft px-5 py-2 text-left transition-colors hover:bg-[#faf7f2]"
            >
              <span
                aria-hidden
                className={cn(
                  "size-[18px] rounded-[5px] border-[1.5px] text-center text-xs leading-[15px] text-card",
                  on ? "border-primary bg-primary" : "border-[#b9afa1] bg-card",
                )}
              >
                {on ? "✓" : ""}
              </span>
              <PhotoFill hex={cover.hex} imageUrl={cover.imageUrl} className="h-[38px] w-[30px] rounded" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{p.name || "Untitled"}</span>
                <span className="text-[11px] text-subtle">
                  {plural(p.variants.length, "colour")} · {units ? `${formatNumber(units)} in stock` : "sold out"}
                </span>
              </span>
              <span className="text-[13px] tabular-nums">{p.priceCents ? formatMoney(p.priceCents) : "No price"}</span>
            </button>
          );
        })}
        {!shown.length && <div className="p-5 text-[13px] text-subtle">No products match these filters.</div>}
      </div>
    </Panel>
  );
}

function CatalogueSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-24 w-72" />
      <div className="flex gap-2.5">
        <Skeleton className="h-[64px] w-[180px] rounded-xl" />
        <Skeleton className="h-[64px] w-[150px] rounded-xl" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-4">
        <Skeleton className="h-[420px] rounded-[14px]" />
        <Skeleton className="h-[560px] rounded-[14px]" />
      </div>
    </div>
  );
}
