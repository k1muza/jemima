"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/inventory/confirm-dialog";
import { buttonStyles, PageHeader, Panel, PhotoFill, photoBackground, Segmented, Swatch } from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  CATALOGUE_THEMES,
  catalogueItems,
  colourOptions,
  coverPhoto,
  filterForEditor,
  pageCount,
  selectedIds,
  themeInfo,
  type PhotoRef,
} from "@/lib/catalogue/model";
import { coverOf } from "@/lib/inventory/catalogue";
import { formatMoney, formatNumber, plural } from "@/lib/inventory/format";
import { productUnits } from "@/lib/inventory/stock";
import { thumbSrc } from "@/lib/inventory/thumbnail";
import type { Catalogue, CataloguePageLayout, CatalogueTheme, Category } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

import { CataloguePreview } from "./catalogue-preview";
import { useCatalogueExport } from "./use-catalogue-export";

const inputClass =
  "h-10 rounded-[9px] border bg-card px-3 text-[15px] text-foreground focus:border-foreground focus:outline-none";

export function CatalogueEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useInventoryHydrated();
  const catalogue = useInventory((s) => s.catalogues.find((c) => c.id === id));

  if (!hydrated) return <CatalogueSkeleton />;
  if (!catalogue) return <NotFound />;
  return <Editor catalogue={catalogue} />;
}

function Editor({ catalogue }: { catalogue: Catalogue }) {
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const items = useMemo(() => catalogueItems(catalogue, products, images), [catalogue, products, images]);
  const pages = pageCount(catalogue, items);
  const { busy, preview, previewPdf, previewWeb, closePreview } = useCatalogueExport(catalogue);
  const empty = !items.length;

  return (
    <div className="-mt-6 flex flex-col gap-8 md:-mt-10">
      <CataloguePreview file={preview} onClose={closePreview} />
      <SaveBar />
      <PageHeader
        eyebrow={`${plural(items.length, "product")} · ${plural(pages, "page")}`}
        title={catalogue.name || "Untitled catalogue"}
        actions={
          <>
            <button type="button" onClick={previewPdf} disabled={empty || !!busy} className={buttonStyles.outline}>
              {busy === "pdf" ? "Making PDF…" : "View PDF"}
            </button>
            <button type="button" onClick={previewWeb} disabled={empty || !!busy} className={buttonStyles.outline}>
              {busy === "web" ? "Making web page…" : "View web file"}
            </button>
            <Link href={`/dashboard/catalogue/${catalogue.id}/view`} className={buttonStyles.primary}>
              Open web page →
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-4">
        <div className="flex flex-col gap-4">
          <DetailsPanel catalogue={catalogue} />
          <DesignPanel catalogue={catalogue} cover={coverPhoto(items)} />
          <LayoutPanel catalogue={catalogue} />
        </div>
        <ProductsPanel catalogue={catalogue} />
      </div>
    </div>
  );
}

function SaveBar() {
  const router = useRouter();
  const flushPending = useInventory((s) => s.flushPending);
  const createCatalogue = useInventory((s) => s.createCatalogue);
  const [saving, setSaving] = useState(false);

  // Edits already save as you type; these just finish any pending saves, then move on.
  const save = async (next: "list" | "new") => {
    setSaving(true);
    await flushPending();
    router.push(next === "list" ? "/dashboard/catalogue" : `/dashboard/catalogue/${createCatalogue(NEW_CATALOGUE)}`);
    setSaving(false);
  };

  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/94 py-4 backdrop-blur-sm md:top-0">
      <Link
        href="/dashboard/catalogue"
        className="py-1.5 pr-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
      >
        ← All catalogues
      </Link>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-[7px] text-[13px] text-muted-foreground">
          <span className="size-[7px] rounded-full bg-[oklch(0.62_0.12_145)]" />
          Saved automatically
        </span>
        <button type="button" disabled={saving} onClick={() => save("new")} className={cn(buttonStyles.outline, "py-2")}>
          Save &amp; add new
        </button>
        <button type="button" disabled={saving} onClick={() => save("list")} className={cn(buttonStyles.primary, "py-2")}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export const NEW_CATALOGUE: Partial<Catalogue> = {
  name: "New catalogue",
  title: "New catalogue",
  subtitle: "",
  productIds: [],
};

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-serif text-5xl">Catalogue not found</h1>
      <p className="text-sm text-muted-foreground">It may have been deleted.</p>
      <Link href="/dashboard/catalogue" className={buttonStyles.outline}>
        ← All catalogues
      </Link>
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
  const router = useRouter();
  const products = useInventory((s) => s.products);
  const canDelete = useInventory((s) => s.catalogues.length > 1);
  const { updateCatalogue, createCatalogue, deleteCatalogue } = useInventory((s) => s);
  const update = (patch: Partial<Catalogue>) => updateCatalogue(catalogue.id, patch);

  const duplicate = () => {
    const id = createCatalogue({
      ...catalogue,
      name: `${catalogue.name || "Catalogue"} copy`,
      productIds: selectedIds(catalogue, products),
    });
    router.push(`/dashboard/catalogue/${id}`);
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
                onConfirm={() => {
                  deleteCatalogue(catalogue.id);
                  router.push("/dashboard/catalogue");
                }}
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

function DesignPanel({ catalogue, cover }: { catalogue: Catalogue; cover: PhotoRef }) {
  const updateCatalogue = useInventory((s) => s.updateCatalogue);

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <PanelHeading>Design</PanelHeading>
      <div role="radiogroup" aria-label="Design" className="grid grid-cols-4 gap-2.5">
        {CATALOGUE_THEMES.map((theme) => {
          const on = catalogue.theme === theme.value;
          return (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => updateCatalogue(catalogue.id, { theme: theme.value })}
              className="group flex min-w-0 flex-col gap-1.5 text-left"
            >
              <span
                className={cn(
                  "block rounded-lg p-[3px] ring-1 transition-shadow",
                  on ? "ring-2 ring-foreground" : "ring-border group-hover:ring-foreground/50",
                )}
              >
                <ThemeThumb theme={theme.value} cover={cover} />
              </span>
              <span className={cn("truncate text-xs", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                {theme.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[13px] leading-snug text-muted-foreground">{themeInfo(catalogue.theme).description}</p>
    </Panel>
  );
}

/** A tiny cover in each design, using the catalogue's own cover photo. */
function ThemeThumb({ theme, cover }: { theme: CatalogueTheme; cover: PhotoRef }) {
  const { page, ink, accent } = themeInfo(theme).swatch;
  const thumbs = useInventory((s) => s.thumbs);
  const photo = (backdrop?: string) => photoBackground(cover.hex, thumbSrc(thumbs, cover.imageUrl), cover.backdrop ?? backdrop);
  const bar = "block h-[3px] rounded-full";
  const frame = "relative flex aspect-3/4 overflow-hidden rounded-[5px]";

  if (theme === "Atelier")
    return (
      <span className={cn(frame, "flex-col items-center gap-[5%] p-[10%]")} style={{ background: page }}>
        <span className={cn(bar, "w-1/3 h-[2px]")} style={{ background: ink }} />
        <span className="w-full flex-1" style={photo()} />
        <span className={cn(bar, "w-3/4")} style={{ background: ink }} />
        <span className={cn(bar, "w-full h-px")} style={{ background: accent }} />
      </span>
    );
  if (theme === "Lookbook")
    return (
      <span className={cn(frame, "items-end p-[9%]")} style={photo(ink)}>
        <span className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/75" />
        <span className="relative font-serif text-[22px] leading-[0.8] text-white">Aa</span>
      </span>
    );
  if (theme === "Boutique")
    return (
      <span className={cn(frame, "flex-col items-center gap-[6%] px-[18%] pt-[14%] pb-[9%]")} style={{ background: accent }}>
        <span className="w-full flex-1 rounded-t-full" style={photo("#fcf6f1")} />
        <span className="font-serif text-[15px] leading-none text-[#fbf1e8] italic">Aa</span>
      </span>
    );
  return (
    <span className={cn(frame, "flex-col gap-[6%] p-[10%]")} style={{ background: ink }}>
      <span className="w-full flex-1" style={photo()} />
      <span className="font-serif text-[18px] leading-none text-[#f2ede4] italic">Aa</span>
    </span>
  );
}

const layouts = (catalogue: Catalogue): { value: CataloguePageLayout; label: string }[] => [
  { value: "Grid", label: `Grid · ${themeInfo(catalogue.theme).perPage} per page` },
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
        options={layouts(catalogue)}
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
  const thumbs = useInventory((s) => s.thumbs);
  const updateCatalogue = useInventory((s) => s.updateCatalogue);
  const update = (patch: Partial<Catalogue>) => updateCatalogue(catalogue.id, patch);

  const selected = selectedIds(catalogue, products);
  const selectedSet = new Set(selected);
  const shown = filterForEditor(catalogue, products);
  const colours = useMemo(() => colourOptions(products), [products]);
  const selectedCount = selected.filter((id) => products.some((p) => p.id === id)).length;
  // Ticked but not printed: "Leave out sold-out items" drops them from the catalogue.
  const leftOut = catalogue.hideSoldOut ? products.filter((p) => selectedSet.has(p.id) && productUnits(p) === 0).length : 0;

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
        {leftOut > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-[9px] bg-secondary px-3 py-2.5 text-[13px]">
            <span>
              {plural(leftOut, "ticked product")} {leftOut === 1 ? "is" : "are"} sold out, so{" "}
              {leftOut === 1 ? "it's" : "they're"} left out of the catalogue.
            </span>
            <button
              type="button"
              onClick={() => update({ hideSoldOut: false })}
              className="font-medium underline underline-offset-[3px]"
            >
              Include sold-out items
            </button>
          </div>
        )}
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
          const cover = coverOf(p, images, thumbs);
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
                  {plural(p.variants.length, "colour")} ·{" "}
                  {units
                    ? `${formatNumber(units)} in stock`
                    : on && catalogue.hideSoldOut
                      ? "sold out · not in catalogue"
                      : "sold out"}
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

export function CatalogueSkeleton() {
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
