"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, type ReactNode } from "react";

import { buttonStyles, PhotoFill, Swatch } from "@/components/inventory/primitives";
import { catalogueFooter, catalogueItems, coverPhoto } from "@/lib/catalogue/model";
import type { Catalogue } from "@/lib/inventory/types";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

import { CataloguePreview } from "../../catalogue-preview";
import { useCatalogueExport } from "../../use-catalogue-export";

/** Full-screen preview of the catalogue as customers see the web page. */
export function CatalogueWebView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useInventoryHydrated();
  const catalogue = useInventory((s) => s.catalogues.find((c) => c.id === id));

  if (!hydrated) return <Overlay />;
  if (!catalogue) return <NotFound />;
  return <WebView catalogue={catalogue} />;
}

/** Covers the dashboard and stops the page behind from scrolling. */
function Overlay({ children }: { children?: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return <div className="fixed inset-0 z-60 overflow-y-auto bg-background text-foreground">{children}</div>;
}

function WebView({ catalogue }: { catalogue: Catalogue }) {
  const router = useRouter();
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const shopName = useInventory((s) => s.settings.shopName);
  const storeName = shopName.trim() || "Jemima's Designs";
  const items = useMemo(() => catalogueItems(catalogue, products, images), [catalogue, products, images]);
  const { busy, preview, previewPdf, downloadWeb, closePreview } = useCatalogueExport(catalogue);
  const title = catalogue.title || catalogue.name;
  const cover = coverPhoto(items);

  const editorHref = `/dashboard/catalogue/${catalogue.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push(editorHref);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, editorHref]);

  const pill =
    "h-[38px] whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-colors disabled:opacity-50";

  return (
    <Overlay>
      <CataloguePreview file={preview} onClose={closePreview} />
      <div className="sticky top-0 z-3 flex items-center justify-between gap-3 bg-primary/88 px-[clamp(16px,3vw,32px)] py-3 text-sidebar-foreground backdrop-blur-[10px]">
        <Link
          href={editorHref}
          className="py-2 text-sm font-medium whitespace-nowrap text-sidebar-foreground hover:text-white"
        >
          ← Back to editor
        </Link>
        <span className="hidden truncate text-[13px] text-dim sm:block">{catalogue.name}</span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={previewPdf}
            disabled={!items.length || !!busy}
            className={`${pill} border border-[#4a433b] hover:border-sidebar-foreground`}
          >
            {busy === "pdf" ? "Making PDF…" : "PDF"}
          </button>
          <button
            type="button"
            onClick={downloadWeb}
            disabled={!items.length || !!busy}
            className={`${pill} bg-sidebar-foreground text-primary hover:bg-white`}
          >
            {busy === "web" ? "Making…" : "Download"}
          </button>
        </span>
      </div>

      {catalogue.cover && (
        <section className="grid min-h-[78vh] grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] bg-primary text-sidebar-foreground">
          <div className="flex flex-col justify-between gap-12 p-[clamp(28px,6vw,80px)]">
            <div className="text-xs tracking-[0.12em] text-dim uppercase">{storeName}</div>
            <div className="flex flex-col gap-[18px]">
              <h1 className="font-serif text-[clamp(56px,8vw,120px)] leading-[0.9] tracking-[-0.02em] text-balance italic">
                {title}
              </h1>
              {catalogue.subtitle && <p className="max-w-[440px] text-lg leading-normal text-[#c9c0b3]">{catalogue.subtitle}</p>}
            </div>
            <div className="text-xs tracking-[0.12em] text-dim uppercase">
              {items.length} {items.length === 1 ? "piece" : "pieces"}
            </div>
          </div>
          <PhotoFill hex={cover.hex} imageUrl={cover.imageUrl} className="min-h-[420px]" />
        </section>
      )}

      <main className="mx-auto max-w-[1240px] px-[clamp(20px,4vw,48px)] py-[clamp(40px,6vw,88px)]">
        {!catalogue.cover && (
          <div className="mb-14 flex flex-col gap-3">
            <div className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{storeName}</div>
            <h1 className="font-serif text-[clamp(48px,7vw,96px)] leading-[0.92] tracking-[-0.02em] italic">{title}</h1>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-7 gap-y-14">
          {items.map((item) => (
            <article key={item.id} className="flex min-w-0 flex-col gap-3.5">
              <PhotoFill hex={item.cover.hex} imageUrl={item.cover.imageUrl} className="aspect-4/5 rounded" />
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-[26px] leading-[1.1] font-normal">{item.name}</h3>
                {catalogue.showPrices && item.price && (
                  <span className="text-base font-medium whitespace-nowrap">{item.price}</span>
                )}
              </div>
              {catalogue.showColours && item.colours.length > 0 && (
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground">
                  {item.colours.map((c) => (
                    <span key={c.name} className="flex items-center gap-1.5">
                      <Swatch hex={c.hex} className="size-[11px]" />
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        {!items.length && (
          <div className="py-20 text-center text-lg text-muted-foreground">
            No products in this catalogue yet. Go back to the editor to add some.
          </div>
        )}
        <footer className="mt-20 flex flex-wrap justify-between gap-4 border-t pt-[22px] text-[13px] text-subtle">
          <span>{storeName}</span>
          <span>{catalogueFooter(catalogue, storeName)}</span>
        </footer>
      </main>
    </Overlay>
  );
}

function NotFound() {
  return (
    <Overlay>
      <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-4 px-6 py-16">
        <h1 className="font-serif text-5xl">Catalogue not found</h1>
        <p className="text-sm text-muted-foreground">It may have been deleted.</p>
        <Link href="/dashboard/catalogue" className={buttonStyles.outline}>
          ← Back to catalogues
        </Link>
      </div>
    </Overlay>
  );
}
