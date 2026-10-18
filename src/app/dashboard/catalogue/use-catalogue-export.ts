"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { downloadBlob } from "@/lib/catalogue/images";
import { catalogueFileName, catalogueItems } from "@/lib/catalogue/model";
import type { Catalogue } from "@/lib/inventory/types";
import { useInventoryApi } from "@/providers/inventory-store-provider";

export type ExportKind = "pdf" | "web";

/** A built catalogue file, shown in the browser before it's downloaded. */
export type CataloguePreviewFile = { kind: ExportKind; filename: string; blob: Blob; url: string };

/** PDF and web-page previews for a catalogue. The builders load on first use. */
export function useCatalogueExport(catalogue: Catalogue | undefined) {
  const store = useInventoryApi();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [preview, setPreview] = useState<CataloguePreviewFile | null>(null);

  // Free the object URL when the preview closes or is replaced.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const build = async (kind: ExportKind) => {
    if (!catalogue || busy) return null;
    const { products, images, settings } = store.getState();
    const storeName = settings.shopName.trim() || "Jemima's Designs";
    const items = catalogueItems(catalogue, products, images);
    if (!items.length) {
      toast.error("Add at least one product to the catalogue first.");
      return null;
    }
    const name = catalogueFileName(catalogue, storeName);
    setBusy(kind);
    const toastId = toast.loading(kind === "pdf" ? "Making the PDF…" : "Making the web page…");
    try {
      let file: Omit<CataloguePreviewFile, "url">;
      if (kind === "pdf") {
        const { buildCataloguePdf } = await import("@/lib/catalogue/pdf");
        const bytes = await buildCataloguePdf({
          catalogue,
          items,
          storeName,
          onProgress: (done, total) =>
            toast.loading(`Making the PDF… page ${done} of ${total}`, { id: toastId }),
        });
        file = { kind, filename: `${name}.pdf`, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }) };
      } else {
        const { buildCatalogueHtml } = await import("@/lib/catalogue/web");
        const html = await buildCatalogueHtml({ catalogue, items, storeName });
        file = { kind, filename: `${name}.html`, blob: new Blob([html], { type: "text/html;charset=utf-8" }) };
      }
      toast.dismiss(toastId);
      return file;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't make the catalogue.", { id: toastId });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const open = async (kind: ExportKind) => {
    const file = await build(kind);
    if (file) setPreview({ ...file, url: URL.createObjectURL(file.blob) });
  };

  /**
   * The PDF opens in a new tab. The tab is opened straight away, while the click still
   * counts as the user's, since pop-up blockers stop tabs opened after the PDF is built.
   */
  const openPdfTab = async () => {
    if (!catalogue || busy) return;
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = "Making the PDF…";
      tab.document.body.style.cssText = "margin:0;padding:32px;font:14px system-ui,sans-serif;color:#6b645c";
      tab.document.body.textContent = "Making the PDF…";
    }
    const file = await build("pdf");
    if (!file) {
      tab?.close();
      return;
    }
    const url = URL.createObjectURL(file.blob);
    if (!tab) {
      // Pop-ups blocked: show it here instead.
      setPreview({ ...file, url });
    } else if (tab.closed) {
      URL.revokeObjectURL(url);
    } else {
      // The tab keeps the object URL; it's freed when this page closes.
      tab.location.href = url;
    }
  };

  const download = async (kind: ExportKind) => {
    const file = await build(kind);
    if (file) downloadBlob(file.filename, file.blob);
  };

  return {
    busy,
    preview,
    previewPdf: openPdfTab,
    previewWeb: () => open("web"),
    downloadWeb: () => download("web"),
    closePreview: () => setPreview(null),
  };
}
