"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState, type ReactNode } from "react";

import { buttonStyles } from "@/components/inventory/primitives";
import { catalogueItems, coverUrls } from "@/lib/catalogue/model";
import { photoLuminances } from "@/lib/catalogue/photo-tone";
import { catalogueHtml } from "@/lib/catalogue/web";
import type { Catalogue, Product } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
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
function Overlay({ children, className }: { children?: ReactNode; className?: string }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <div className={cn("fixed inset-0 z-60 overflow-y-auto bg-background text-foreground", className)}>{children}</div>
  );
}

function WebView({ catalogue }: { catalogue: Catalogue }) {
  const router = useRouter();
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const shopName = useInventory((s) => s.settings.shopName);
  const storeName = shopName.trim() || "Jemima's Designs";
  const tones = usePhotoTones(catalogue, products, images);
  const items = useMemo(() => catalogueItems(catalogue, products, images, tones), [catalogue, products, images, tones]);
  const { busy, preview, previewPdf, downloadWeb, closePreview } = useCatalogueExport(catalogue);
  // The same page customers get when it's downloaded, with live photo links.
  const html = useMemo(() => catalogueHtml({ catalogue, items, storeName }), [catalogue, items, storeName]);

  const editorHref = `/dashboard/catalogue/${catalogue.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push(editorHref);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, editorHref]);

  const pill =
    "h-[38px] whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-colors disabled:opacity-50";

  return (
    <Overlay className="flex flex-col overflow-hidden">
      <CataloguePreview file={preview} onClose={closePreview} />
      <div className="flex items-center justify-between gap-3 bg-primary px-[clamp(16px,3vw,32px)] py-3 text-sidebar-foreground">
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

      <iframe srcDoc={html} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title={catalogue.title || catalogue.name} className="min-h-0 w-full flex-1 border-0" />
    </Overlay>
  );
}

/** Measured garment luminance of the catalogue's cutout photos; fills in as photos are measured. */
function usePhotoTones(catalogue: Catalogue, products: Product[], images: Record<string, string>) {
  const urls = useMemo(() => coverUrls(catalogueItems(catalogue, products, images)), [catalogue, products, images]);
  const key = urls.join(" ");
  const [tones, setTones] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    photoLuminances(key ? key.split(" ") : []).then((measured) => live && setTones(measured));
    return () => {
      live = false;
    };
  }, [key]);
  return tones;
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
