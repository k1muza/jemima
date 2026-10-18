"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { downloadBlob } from "@/lib/catalogue/images";
import { catalogueFileName, catalogueItems, coverUrls } from "@/lib/catalogue/model";
import { photoLuminances } from "@/lib/catalogue/photo-tone";
import type { Catalogue } from "@/lib/inventory/types";
import { useInventoryApi } from "@/providers/inventory-store-provider";

export type ExportKind = "pdf" | "web";

/** Web-file previews are still built locally; PDF bytes are generated on the server. */
export type CataloguePreviewFile = { kind: "web"; filename: string; blob: Blob; url: string };

/** PDF opens at a server URL in the browser's native viewer; web export remains client-side. */
export function useCatalogueExport(catalogue: Catalogue | undefined) {
  const store = useInventoryApi();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [preview, setPreview] = useState<CataloguePreviewFile | null>(null);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const buildWeb = async () => {
    if (!catalogue || busy) return null;
    const { products, images, settings } = store.getState();
    const storeName = settings.shopName.trim() || "Jemima's Designs";
    const unmeasured = catalogueItems(catalogue, products, images);
    if (!unmeasured.length) {
      toast.error("Add at least one product to the catalogue first.");
      return null;
    }

    setBusy("web");
    const toastId = toast.loading("Making the web page…");
    try {
      const tones = await photoLuminances(coverUrls(unmeasured));
      const items = catalogueItems(catalogue, products, images, tones);
      const { buildCatalogueHtml } = await import("@/lib/catalogue/web");
      const html = await buildCatalogueHtml({ catalogue, items, storeName });
      toast.dismiss(toastId);
      return {
        kind: "web" as const,
        filename: `${catalogueFileName(catalogue, storeName)}.html`,
        blob: new Blob([html], { type: "text/html;charset=utf-8" }),
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't make the web page.", { id: toastId });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const previewWeb = async () => {
    const file = await buildWeb();
    if (file) setPreview({ ...file, url: URL.createObjectURL(file.blob) });
  };

  /**
   * Open a tab synchronously (otherwise pop-up blockers reject it), flush pending
   * catalogue edits, then navigate to an HTTPS PDF response. The browser's own PDF
   * viewer shows the document and provides its standard Download/Print controls.
   */
  const previewPdf = async () => {
    if (!catalogue || busy) return;
    if (store.getState().mode === "demo") {
      toast.error("Server PDF exports require Supabase. Configure the database to preview PDFs.");
      return;
    }
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = "Preparing catalogue PDF…";
      tab.document.body.style.cssText = "margin:0;padding:32px;font:14px system-ui,sans-serif;color:#6b645c";
      tab.document.body.textContent = "Preparing catalogue PDF…";
    }

    setBusy("pdf");
    try {
      await store.getState().flushPending();
      if (store.getState().hasPending()) throw new Error("Your changes haven't saved yet. Please retry.");
      const url = new URL(`/api/catalogue/pdf?catalogueId=${encodeURIComponent(catalogue.id)}`, window.location.origin).href;
      if (tab && !tab.closed) {
        tab.location.href = url;
      } else if (!tab) {
        // Popup blocked: use the same tab rather than generating a local PDF.
        window.location.assign(url);
      }
    } catch (error) {
      tab?.close();
      toast.error(error instanceof Error ? error.message : "Couldn't open the PDF.");
    } finally {
      setBusy(null);
    }
  };

  const downloadWeb = async () => {
    const file = await buildWeb();
    if (file) downloadBlob(file.filename, file.blob);
  };

  return {
    busy,
    preview,
    previewPdf,
    previewWeb,
    downloadWeb,
    closePreview: () => setPreview(null),
  };
}
