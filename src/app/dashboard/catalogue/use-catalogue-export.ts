"use client";

import { useState } from "react";
import { toast } from "sonner";

import { downloadBlob } from "@/lib/catalogue/images";
import { catalogueFileName, catalogueItems } from "@/lib/catalogue/model";
import type { Catalogue } from "@/lib/inventory/types";
import { useInventoryApi } from "@/providers/inventory-store-provider";

export type ExportKind = "pdf" | "web";

/** PDF and web-page downloads for a catalogue. The builders load on first use. */
export function useCatalogueExport(catalogue: Catalogue | undefined) {
  const store = useInventoryApi();
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const run = async (kind: ExportKind) => {
    if (!catalogue || busy) return;
    const { products, images, settings } = store.getState();
    const storeName = settings.shopName.trim() || "Jemima's Designs";
    const items = catalogueItems(catalogue, products, images);
    if (!items.length) {
      toast.error("Add at least one product to the catalogue first.");
      return;
    }
    const name = catalogueFileName(catalogue, storeName);
    setBusy(kind);
    const toastId = toast.loading(kind === "pdf" ? "Making the PDF…" : "Making the web page…");
    try {
      if (kind === "pdf") {
        const { buildCataloguePdf } = await import("@/lib/catalogue/pdf");
        const bytes = await buildCataloguePdf({
          catalogue,
          items,
          storeName,
          onProgress: (done, total) =>
            toast.loading(`Making the PDF… page ${done} of ${total}`, { id: toastId }),
        });
        downloadBlob(`${name}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }));
      } else {
        const { buildCatalogueHtml } = await import("@/lib/catalogue/web");
        const html = await buildCatalogueHtml({ catalogue, items, storeName });
        downloadBlob(`${name}.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
      }
      toast.success(kind === "pdf" ? "PDF downloaded" : "Web page downloaded", { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't make the catalogue.", { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  return { busy, downloadPdf: () => run("pdf"), downloadWeb: () => run("web") };
}
