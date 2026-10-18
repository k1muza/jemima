"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Eraser, Hand, LoaderCircle, Maximize, Paintbrush, Redo2, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cutoutKey, maskKey } from "@/lib/inventory/cutout";
import { loadPixels, pngDataUrl } from "@/lib/inventory/pixels";
import {
  composite,
  createMaskEditor,
  isMaskEmpty,
  maskFromRgba,
  maskToRgba,
  type MaskEditor,
  type Rect,
} from "@/lib/inventory/refine";
import type { Photo } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory } from "@/providers/inventory-store-provider";

type Tool = "erase" | "restore" | "pan";
type View = { scale: number; x: number; y: number };
type Status = "loading" | "ready" | { error: string };

const MIN_SCALE = 0.05;
const MAX_SCALE = 32;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
/** Checkerboard behind the photo, so transparent areas are visible. */
const CHECKER = "repeating-conic-gradient(#d9d6d0 0 25%, #f7f5f1 0 50%)";

/**
 * Hand refinement of a background-removed photo: erase leftovers, restore what
 * was erased by mistake. Edits a mask over the untouched cutout (see refine.ts).
 */
export function RefineEditor({ productId, photo, onClose }: { productId: string; photo: Photo; onClose: () => void }) {
  const cutoutUrl = useInventory((s) => s.images[cutoutKey(photo.id)]);
  const maskUrl = useInventory((s) => (photo.refined ? s.images[maskKey(photo.id)] : undefined));
  const saveRefinement = useInventory((s) => s.saveRefinement);
  // What the session edits, fixed when it opens: a background data refresh (new signed
  // URLs) must not reload the editor and wipe unsaved work. "Try again" picks up fresh ones.
  const [source, setSource] = useState({ cutoutUrl, maskUrl, refined: !!photo.refined });

  const [status, setStatus] = useState<Status>("loading");
  const [tool, setTool] = useState<Tool>("erase");
  const [size, setSize] = useState(28);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [history, setHistory] = useState({ canUndo: false, canRedo: false, dirty: false, empty: true });
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MaskEditor | null>(null);
  const baseRef = useRef<ImageData | null>(null);
  const displayRef = useRef<ImageData | null>(null);
  const pendingRect = useRef<Rect | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "draw" }
    | { kind: "pan"; startX: number; startY: number; view: View }
    | { kind: "pinch"; distance: number; mid: { x: number; y: number }; view: View }
    | { kind: "idle" }
  >({ kind: "idle" });

  const syncHistory = useCallback(() => {
    const editor = editorRef.current;
    if (editor) {
      setHistory({ canUndo: editor.canUndo, canRedo: editor.canRedo, dirty: editor.dirty, empty: isMaskEmpty(editor.mask) });
    }
  }, []);

  /** Redraw changed regions once per frame. */
  const scheduleRedraw = useCallback((rect: Rect) => {
    const pending = pendingRect.current;
    if (pending) {
      const x = Math.min(pending.x, rect.x);
      const y = Math.min(pending.y, rect.y);
      pendingRect.current = {
        x,
        y,
        w: Math.max(pending.x + pending.w, rect.x + rect.w) - x,
        h: Math.max(pending.y + pending.h, rect.y + rect.h) - y,
      };
      return;
    }
    pendingRect.current = rect;
    requestAnimationFrame(() => {
      const r = pendingRect.current;
      pendingRect.current = null;
      const base = baseRef.current;
      const display = displayRef.current;
      const editor = editorRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (!r || !base || !display || !editor || !ctx) return;
      composite(base.data, editor.mask, display.data, base.width, r);
      ctx.putImageData(display, 0, 0, r.x, r.y, r.w, r.h);
    });
  }, []);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const base = baseRef.current;
    if (!viewport || !base) return;
    const { width, height } = viewport.getBoundingClientRect();
    const scale = clampScale(Math.min(width / base.width, height / base.height) * 0.92);
    setView({ scale, x: (width - base.width * scale) / 2, y: (height - base.height * scale) / 2 });
  }, []);

  // Load the cutout (the base) and any saved mask.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!source.cutoutUrl) throw new Error("This photo's background-removed version isn't available.");
      const base = await loadPixels(source.cutoutUrl);
      let initial: Uint8Array | undefined;
      if (source.refined) {
        // Never start over silently: saving would wipe the earlier refinements.
        if (!source.maskUrl) throw new Error("Couldn't load your earlier refinements.");
        const saved = await loadPixels(source.maskUrl).catch(() => {
          throw new Error("Couldn't load your earlier refinements.");
        });
        if (saved.width !== base.width || saved.height !== base.height) {
          throw new Error("Your earlier refinements don't match this photo any more.");
        }
        initial = maskFromRgba(saved.data);
      }
      if (cancelled) return;
      baseRef.current = base;
      displayRef.current = new ImageData(base.width, base.height);
      const editor = createMaskEditor(base.width, base.height, initial, scheduleRedraw);
      editorRef.current = editor;
      composite(base.data, editor.mask, displayRef.current.data, base.width);
      const canvas = canvasRef.current!;
      canvas.width = base.width;
      canvas.height = base.height;
      canvas.getContext("2d")!.putImageData(displayRef.current, 0, 0);
      setStatus("ready");
      syncHistory();
      fit();
    })().catch((error: unknown) => {
      if (!cancelled) setStatus({ error: error instanceof Error ? error.message : "Couldn't open the editor." });
    });
    return () => {
      cancelled = true;
    };
  }, [source, scheduleRedraw, syncHistory, fit]);

  const toImage = (clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale };
  };

  /** Zoom by `factor`, keeping the point under (clientX, clientY) still. */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = (clientX ?? r.left + r.width / 2) - r.left;
    const py = (clientY ?? r.top + r.height / 2) - r.top;
    setView((v) => {
      const scale = clampScale(v.scale * factor);
      return { scale, x: px - ((px - v.x) * scale) / v.scale, y: py - ((py - v.y) * scale) / v.scale };
    });
  }, []);

  // Wheel zoom (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const undo = useCallback(() => {
    editorRef.current?.undo();
    syncHistory();
  }, [syncHistory]);
  const redo = useCallback(() => {
    editorRef.current?.redo();
    syncHistory();
  }, [syncHistory]);

  // Keyboard: hold Space to pan; Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo.
  useEffect(() => {
    if (confirmDiscard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [undo, redo, confirmDiscard]);

  // Unsaved work survives an accidental reload or tab close.
  useEffect(() => {
    if (!history.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [history.dirty]);

  const panning = tool === "pan" || spaceHeld;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (status !== "ready" || !editor || saving) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      // A second finger means navigating: drop the stroke it interrupted.
      if (editor.drawing) {
        editor.cancel();
        syncHistory();
      }
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view,
      };
    } else if (pointers.current.size === 1) {
      if (panning || e.button === 1 || (e.pointerType === "mouse" && e.button !== 0)) {
        gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view };
      } else {
        const p = toImage(e.clientX, e.clientY);
        editor.begin(tool, size / 2 / view.scale);
        editor.to(p.x, p.y);
        gesture.current = { kind: "draw" };
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const cursor = cursorRef.current;
    if (cursor && e.pointerType === "mouse") {
      const r = e.currentTarget.getBoundingClientRect();
      cursor.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2}px)`;
      cursor.style.opacity = "1";
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (g.kind === "draw") {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const p = toImage(ev.clientX, ev.clientY);
        editorRef.current?.to(p.x, p.y);
      }
    } else if (g.kind === "pan") {
      setView({ ...g.view, x: g.view.x + e.clientX - g.startX, y: g.view.y + e.clientY - g.startY });
    } else if (g.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = e.currentTarget.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      const startMid = { x: g.mid.x - r.left, y: g.mid.y - r.top };
      const scale = clampScale((g.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.distance));
      // The image point under the fingers' starting midpoint follows the midpoint.
      const ix = (startMid.x - g.view.x) / g.view.scale;
      const iy = (startMid.y - g.view.y) / g.view.scale;
      setView({ scale, x: mid.x - ix * scale, y: mid.y - iy * scale });
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (gesture.current.kind === "draw") {
      if (e.type === "pointercancel") editorRef.current?.cancel();
      else editorRef.current?.end();
      syncHistory();
    }
    // After a pinch, wait for every finger to lift: a leftover finger never draws.
    gesture.current = { kind: "idle" };
  };

  const close = () => {
    if (saving) return;
    if (history.dirty) setConfirmDiscard(true);
    else onClose();
  };

  const save = async () => {
    const editor = editorRef.current;
    const base = baseRef.current;
    if (!editor || !base || !history.dirty || saving) return;
    setSaving(true);
    try {
      let refinement = null;
      if (!isMaskEmpty(editor.mask)) {
        const refined = new Uint8ClampedArray(base.data.length);
        composite(base.data, editor.mask, refined, base.width);
        const [refinedUrl, maskUrl] = await Promise.all([
          pngDataUrl(refined, base.width, base.height),
          pngDataUrl(maskToRgba(editor.mask), base.width, base.height),
        ]);
        refinement = { refined: refinedUrl, mask: maskUrl };
      }
      await saveRefinement(productId, photo.id, refinement);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your refinements.", {
        description: "Your changes are still here. Try saving again.",
      });
      setSaving(false);
    }
  };

  const ready = status === "ready";
  const reset = () => {
    editorRef.current?.reset();
    syncHistory();
  };
  const checker = 16 / view.scale;

  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && close()}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-card outline-none sm:inset-6 sm:rounded-[14px] sm:shadow-2xl">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
              <div className="mr-auto min-w-0">
                <Dialog.Title className="font-serif text-[22px] leading-tight font-normal">Refine photo</Dialog.Title>
                <Dialog.Description className="text-xs text-subtle">
                  Brush to erase leftovers. Restore brings back erased parts. Pinch, scroll or hold Space to move around.
                </Dialog.Description>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <ToolButton label="Eraser" icon={Eraser} active={tool === "erase"} onClick={() => setTool("erase")} />
                <ToolButton label="Restore brush" icon={Paintbrush} active={tool === "restore"} onClick={() => setTool("restore")} />
                <ToolButton label="Move around (pan)" icon={Hand} active={tool === "pan"} onClick={() => setTool("pan")} />
                <label className="mx-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="sr-only sm:not-sr-only">Brush</span>
                  <input
                    type="range"
                    min={4}
                    max={120}
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    aria-label="Brush size"
                    className="w-24 accent-primary"
                  />
                </label>
                <ToolButton label="Undo" icon={Undo2} onClick={undo} disabled={!ready || !history.canUndo} />
                <ToolButton label="Redo" icon={Redo2} onClick={redo} disabled={!ready || !history.canRedo} />
                <ToolButton
                  label="Reset to the background-removed image"
                  icon={RotateCcw}
                  onClick={reset}
                  disabled={!ready || history.empty}
                />
                <ToolButton label="Zoom out" icon={ZoomOut} onClick={() => zoomAt(1 / 1.4)} disabled={!ready} />
                <ToolButton label="Zoom in" icon={ZoomIn} onClick={() => zoomAt(1.4)} disabled={!ready} />
                <ToolButton label="Fit to screen" icon={Maximize} onClick={fit} disabled={!ready} />
              </div>
            </div>

            <div
              ref={viewportRef}
              className={cn(
                "relative min-h-0 flex-1 touch-none overflow-hidden overscroll-contain bg-muted select-none",
                ready && (panning ? "cursor-grab" : "cursor-none"),
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onPointerLeave={() => cursorRef.current && (cursorRef.current.style.opacity = "0")}
              onContextMenu={(e) => e.preventDefault()}
            >
              <canvas
                ref={canvasRef}
                className={cn("absolute top-0 left-0 origin-top-left shadow-sm", !ready && "invisible")}
                style={
                  {
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                    background: CHECKER,
                    backgroundSize: `${checker}px ${checker}px`,
                    imageRendering: view.scale > 2 ? "pixelated" : "auto",
                  } as CSSProperties
                }
              />
              {ready && !panning && (
                <div
                  ref={cursorRef}
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 rounded-full border border-white opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,.55)]"
                  style={{ width: size, height: size }}
                />
              )}
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Loading photo…
                </div>
              )}
              {typeof status === "object" && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm">
                  <p>{status.error}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStatus("loading");
                      setSource({ cutoutUrl, maskUrl, refined: !!photo.refined });
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <Button variant="ghost" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!ready || !history.dirty || saving}>
                {saving && <LoaderCircle className="animate-spin" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>The refinements you made since opening this photo haven&apos;t been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ToolButton({
  label,
  icon: Icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Eraser;
  /** For tool toggles: whether this tool is selected. */
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon-sm"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon />
    </Button>
  );
}
