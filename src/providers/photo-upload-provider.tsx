"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { NameSuggestion } from "@/lib/gemini";
import { processPhoto } from "@/lib/inventory/colour";
import { plural } from "@/lib/inventory/format";

import { useInventory, useInventoryApi } from "./inventory-store-provider";

/** A product id, or "new" to start a product from the photos. */
type UploadTarget = string | "new";

type PhotoUploadContextValue = {
  pick: (target: UploadTarget) => void;
  addFiles: (target: UploadTarget, files: FileList | File[] | null) => void;
  /** Explicitly suggest a name from a product photo, replacing the current name. */
  suggestName: (productId: string, image: string) => Promise<"updated" | "handled" | "unavailable">;
  /** True while files are being dragged anywhere over the window. */
  dragging: boolean;
};

const PhotoUploadContext = createContext<PhotoUploadContextValue | null>(null);

export function PhotoUploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const store = useInventoryApi();
  const busy = useInventory((s) => s.busy);
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<UploadTarget>("new");
  const [dragging, setDragging] = useState(false);
  // Products already sent for a name suggestion this session: one call per product.
  const namedRef = useRef(new Set<string>());
  // Set once Gemini reports its daily quota is used up; no more calls this session.
  const dailyLimitRef = useRef(false);

  /**
   * Fill an empty product name from the photo in the background. Never blocks
   * the upload, and never overwrites a name the user has typed (or typed and
   * cleared) while the suggestion was in flight.
   */
  const suggestName = useCallback(
    (productId: string, dataUrl: string) => {
      const nameOf = (s = store.getState()) => s.products.find((p) => p.id === productId)?.name;
      if (dailyLimitRef.current || namedRef.current.has(productId) || nameOf() !== "") return;
      namedRef.current.add(productId);

      let touched = false;
      const unsubscribe = store.subscribe((s, prev) => {
        if (s.products !== prev.products && nameOf(s)) touched = true;
      });
      fetch("/api/product-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
        signal: AbortSignal.timeout(20_000),
      })
        .then((res) => res.json() as Promise<NameSuggestion>)
        .then(({ name, dailyLimit }) => {
          if (dailyLimit && !dailyLimitRef.current) {
            dailyLimitRef.current = true;
            const hours = dailyLimit.resetsInSeconds ? Math.max(1, Math.round(dailyLimit.resetsInSeconds / 3600)) : null;
            toast("Daily limit reached for name suggestions", {
              description: `Name products yourself for now${hours ? ` — suggestions resume in about ${plural(hours, "hour")}` : ""}.`,
            });
          }
          if (name && !touched && nameOf() === "") store.getState().updateProduct(productId, { name });
        })
        .catch(() => {})
        .finally(unsubscribe);
    },
    [store],
  );

  const suggestNameManually = useCallback(
    async (productId: string, image: string) => {
      if (dailyLimitRef.current) return "handled" as const;
      const nameOf = (s = store.getState()) => s.products.find((p) => p.id === productId)?.name;
      const startingName = nameOf();
      let touched = false;
      const unsubscribe = store.subscribe((s, prev) => {
        if (s.products !== prev.products && nameOf(s) !== startingName) touched = true;
      });

      try {
        // Saved Supabase products use signed URLs, while the API accepts image data.
        const dataUrl = image.startsWith("data:") ? image : await imageUrlToDataUrl(image);
        const res = await fetch("/api/product-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
          signal: AbortSignal.timeout(20_000),
        });
        const { name, dailyLimit } = (await res.json()) as NameSuggestion;
        if (dailyLimit && !dailyLimitRef.current) {
          dailyLimitRef.current = true;
          const hours = dailyLimit.resetsInSeconds ? Math.max(1, Math.round(dailyLimit.resetsInSeconds / 3600)) : null;
          toast("Daily limit reached for name suggestions", {
            description: `Name products yourself for now${hours ? `; suggestions resume in about ${plural(hours, "hour")}` : ""}.`,
          });
        }
        if (dailyLimit || touched || nameOf() !== startingName) return "handled" as const;
        if (!name) return "unavailable" as const;
        store.getState().updateProduct(productId, { name });
        return "updated" as const;
      } catch {
        return "unavailable" as const;
      } finally {
        unsubscribe();
      }
    },
    [store],
  );

  const addFiles = useCallback(
    async (target: UploadTarget, list: FileList | File[] | null) => {
      const images = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
      const { maxPhotoMb } = store.getState().settings;
      const files = images.filter((f) => f.size <= maxPhotoMb * 1024 * 1024);
      if (files.length < images.length) {
        toast.error(`Skipped ${plural(images.length - files.length, "photo")} over ${maxPhotoMb} MB.`);
      }
      if (!files.length) return;

      const { createProduct, addPhoto, setBusy } = store.getState();
      let productId = target;
      if (productId === "new") {
        productId = createProduct();
        router.push(`/dashboard/products/${productId}`);
      }

      setBusy(files.length);
      let failed = 0;
      for (const file of files) {
        try {
          const { dataUrl, hex } = await processPhoto(file);
          addPhoto(productId, dataUrl, hex);
          suggestName(productId, dataUrl);
        } catch {
          failed++;
        } finally {
          setBusy(-1);
        }
      }
      if (failed) toast.error(`Couldn't read ${plural(failed, "photo")}.`);
    },
    [router, store, suggestName],
  );

  const pick = useCallback((target: UploadTarget) => {
    targetRef.current = target;
    inputRef.current?.click();
  }, []);

  // Track file drags across the whole window so drop zones can light up.
  // Capture phase, so drop zones that stopPropagation still reset the state.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => hasFiles(e) && setDragging(true);
    const onLeave = (e: DragEvent) => !e.relatedTarget && setDragging(false);
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
    };
    window.addEventListener("dragenter", onEnter, true);
    window.addEventListener("dragleave", onLeave, true);
    window.addEventListener("dragover", onOver, true);
    window.addEventListener("drop", onDrop, true);
    return () => {
      window.removeEventListener("dragenter", onEnter, true);
      window.removeEventListener("dragleave", onLeave, true);
      window.removeEventListener("dragover", onOver, true);
      window.removeEventListener("drop", onDrop, true);
    };
  }, []);

  const value = useMemo(
    () => ({ pick, addFiles, suggestName: suggestNameManually, dragging }),
    [pick, addFiles, suggestNameManually, dragging],
  );

  return (
    <PhotoUploadContext value={value}>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          addFiles(targetRef.current, files);
        }}
      />
      {busy > 0 && (
        <div
          role="status"
          className="fixed bottom-7 left-1/2 z-80 -translate-x-1/2 rounded-full bg-primary px-5 py-3 text-[13px] text-sidebar-foreground shadow-[0_10px_30px_rgba(0,0,0,.25)]"
        >
          Detecting colours in {plural(busy, "photo")}…
        </div>
      )}
    </PhotoUploadContext>
  );
}

function imageUrlToDataUrl(url: string) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Could not load product photo");
      return res.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    );
}

export function usePhotoUpload() {
  const ctx = use(PhotoUploadContext);
  if (!ctx) throw new Error("usePhotoUpload must be used within PhotoUploadProvider");
  return ctx;
}

/** Props that make an element accept dropped photos for `target`. */
export function useDropTarget(target: UploadTarget) {
  const { addFiles } = usePhotoUpload();
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        addFiles(target, e.dataTransfer.files);
      },
    },
  };
}
