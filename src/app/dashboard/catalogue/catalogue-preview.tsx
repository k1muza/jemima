"use client";

import { useEffect } from "react";

import { downloadBlob } from "@/lib/catalogue/images";

import type { CataloguePreviewFile } from "./use-catalogue-export";

/** Full-screen view of a built catalogue file, with a button to download it. */
export function CataloguePreview({ file, onClose }: { file: CataloguePreviewFile | null; onClose: () => void }) {
  useEffect(() => {
    if (!file) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Capture phase, so Escape closes the preview rather than the page behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [file, onClose]);

  if (!file) return null;

  const pill = "h-[38px] whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-colors";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.filename}
      className="fixed inset-0 z-70 flex flex-col bg-primary text-sidebar-foreground"
    >
      <div className="flex items-center justify-between gap-3 px-[clamp(16px,3vw,32px)] py-3">
        <button
          type="button"
          onClick={onClose}
          className="py-2 text-sm font-medium whitespace-nowrap text-sidebar-foreground hover:text-white"
        >
          ← Close
        </button>
        <span className="hidden truncate text-[13px] text-dim sm:block">{file.filename}</span>
        <button
          type="button"
          onClick={() => downloadBlob(file.filename, file.blob)}
          className={`${pill} bg-sidebar-foreground text-primary hover:bg-white`}
        >
          {file.kind === "pdf" ? "Download PDF" : "Download page"}
        </button>
      </div>
      <iframe src={file.url} title={file.filename} className="min-h-0 w-full flex-1 border-0 bg-white" />
    </div>
  );
}
