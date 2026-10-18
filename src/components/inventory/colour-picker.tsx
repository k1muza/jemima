"use client";

import { LoaderCircle, Pipette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Swatch } from "@/components/inventory/primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NAMED_COLOURS, nameColour, normaliseHex, sampleColour } from "@/lib/inventory/colour";
import { cn } from "@/lib/utils";

/** The browser's screen eyedropper (Chromium only). */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const screenEyeDropper = () =>
  typeof window !== "undefined" ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined;

/**
 * Colour chooser for a stock row: click the garment in one of its photos to
 * sample its colour, pick a named colour, or type a hex value.
 */
export function ColourPicker({
  hex,
  label,
  photos,
  onChange,
  trigger = "swatch",
}: {
  hex: string;
  /** What's being coloured, for screen readers ("Navy"). */
  label: string;
  /** Image URLs of the row's photos, to sample from; the first is shown first. */
  photos: string[];
  onChange: (hex: string) => void;
  /** The row's swatch, or an eyedropper button (beside a photo). */
  trigger?: "swatch" | "pipette";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={trigger === "pipette" ? "Pick the colour from this photo" : "Change colour"}
        aria-label={`Change colour for ${label || "this row"}`}
        className={cn(
          "flex shrink-0 cursor-pointer items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          trigger === "pipette"
            ? "size-[30px] rounded-full border bg-card transition-colors hover:border-foreground data-popup-open:border-foreground"
            : "size-6 rounded-md hover:bg-secondary",
        )}
      >
        {trigger === "pipette" ? <Pipette className="size-3.5" /> : <Swatch hex={hex} className="size-4" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[296px] gap-3 p-3">
        {open && <PickerBody hex={hex} photos={photos} onChange={onChange} />}
      </PopoverContent>
    </Popover>
  );
}

function PickerBody({ hex, photos, onChange }: { hex: string; photos: string[]; onChange: (hex: string) => void }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const EyeDropper = screenEyeDropper();
  const shown = hover ?? hex;

  const commit = (value: string) => {
    setHexDraft(null);
    if (value.toLowerCase() !== hex.toLowerCase()) onChange(value);
  };

  const pickFromScreen = async () => {
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      const value = normaliseHex(sRGBHex);
      if (value) commit(value);
    } catch {
      // Cancelled with Escape.
    }
  };

  return (
    <>
      <div className="flex items-center gap-2.5">
        <Swatch hex={shown} className="size-9 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{nameColour(shown)}</span>
          <span className="font-mono text-xs text-muted-foreground">{shown}</span>
        </div>
        {EyeDropper && (
          <button
            type="button"
            onClick={pickFromScreen}
            title="Pick a colour from anywhere on screen"
            aria-label="Pick a colour from anywhere on screen"
            className="flex size-8 items-center justify-center rounded-md border transition-colors hover:border-foreground"
          >
            <Pipette className="size-4" />
          </button>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Click the garment to use its colour</span>
          <PhotoSampler key={photos[photoIndex]} url={photos[photoIndex]} onHover={setHover} onPick={commit} />
          {photos.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {photos.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Sample from photo ${i + 1}`}
                  aria-pressed={i === photoIndex}
                  className={cn(
                    "h-10 w-8 shrink-0 rounded-md bg-cover bg-center ring-offset-1 ring-offset-popover",
                    i === photoIndex ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100",
                  )}
                  style={{ backgroundImage: `url("${url}")` }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-9 gap-1" role="listbox" aria-label="Named colours">
        {NAMED_COLOURS.map(([name, value]) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={value === hex}
            onClick={() => commit(value)}
            onPointerEnter={() => setHover(value)}
            onPointerLeave={() => setHover(null)}
            title={name}
            aria-label={name}
            className={cn(
              "aspect-square rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.14)] transition-transform hover:scale-110",
              value === hex && "ring-2 ring-foreground ring-offset-1 ring-offset-popover",
            )}
            style={{ background: value }}
          />
        ))}
      </div>

      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const value = normaliseHex(hexDraft ?? hex);
          if (value) commit(value);
        }}
      >
        <input
          value={hexDraft ?? hex}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => {
            const value = hexDraft !== null && normaliseHex(hexDraft);
            if (value) commit(value);
            else setHexDraft(null);
          }}
          aria-label="Hex colour"
          spellCheck={false}
          className={cn(
            "h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-[13px] outline-none focus:border-foreground",
            hexDraft !== null && !normaliseHex(hexDraft) && "border-destructive focus:border-destructive",
          )}
        />
        <label
          title="More colours"
          className="relative flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:border-foreground focus-within:ring-2 focus-within:ring-ring"
        >
          More…
          <input
            type="color"
            value={hex}
            onChange={(e) => commit(e.target.value)}
            aria-label="More colours"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </form>
    </>
  );
}

/** Magnifier diameter (CSS px, inside its border) and zoom. */
const LOUPE_SIZE = 72;
const LOUPE_ZOOM = 4;

/** A photo drawn to a canvas; hovering previews the colour under the pointer, clicking picks it. */
function PhotoSampler({
  url,
  onHover,
  onPick,
}: {
  url: string;
  onHover: (hex: string | null) => void;
  onPick: (hex: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixels = useRef<ImageData | null>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loupe, setLoupe] = useState<{ hex: string; x: number; y: number; width: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetching first keeps the canvas untainted, so its pixels can be read.
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const bitmap = await createImageBitmap(await res.blob());
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return bitmap.close();
        const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        pixels.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const sampleAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const data = pixels.current;
    if (!canvas || !data) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // A patch about 6 on-screen pixels wide, whatever the photo's resolution.
    const radius = Math.max(1, Math.round((3 * canvas.width) / rect.width));
    const hex = sampleColour(data, (x / rect.width) * canvas.width, (y / rect.height) * canvas.height, radius);
    return hex ? { hex, x, y, width: rect.width } : null;
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sample = sampleAt(e);
    setLoupe(sample);
    onHover(sample?.hex ?? null);
    const canvas = canvasRef.current;
    const ctx = loupeRef.current?.getContext("2d");
    if (!sample || !canvas || !ctx) return;
    // Magnify the area under the pointer, pixels kept crisp.
    const rect = canvas.getBoundingClientRect();
    const sx = (sample.x / rect.width) * canvas.width;
    const sy = (sample.y / rect.height) * canvas.height;
    const span = LOUPE_SIZE / LOUPE_ZOOM;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#f6f3ee";
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.drawImage(canvas, sx - span / 2, sy - span / 2, span, span, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
  };

  // Above the pointer (clear of a finger), below it near the top edge; kept inside the photo sideways.
  const loupeStyle = (l: { hex: string; x: number; y: number; width: number }): React.CSSProperties => {
    const above = l.y > LOUPE_SIZE + 16;
    return {
      left: Math.min(Math.max(l.x, LOUPE_SIZE / 2), Math.max(LOUPE_SIZE / 2, l.width - LOUPE_SIZE / 2)),
      top: above ? l.y - LOUPE_SIZE - 16 : l.y + 16,
      transform: "translateX(-50%)",
      borderColor: l.hex,
    };
  };

  return (
    <div className="flex min-h-24 items-center justify-center rounded-md bg-[repeating-conic-gradient(#e7e2d9_0_25%,#f6f3ee_0_50%)] bg-[length:14px_14px]">
      <div className={cn("relative", state !== "ready" && "hidden")}>
        <canvas
          ref={canvasRef}
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => {
            setLoupe(null);
            onHover(null);
          }}
          onPointerUp={(e) => {
            const sample = sampleAt(e);
            if (sample) onPick(sample.hex);
          }}
          className="block h-auto max-h-80 max-w-full cursor-crosshair touch-none rounded-md"
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute z-10 overflow-hidden rounded-full border-[5px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.25),0_4px_12px_rgba(0,0,0,.3)]",
            !loupe && "hidden",
          )}
          style={loupe ? loupeStyle(loupe) : undefined}
        >
          <canvas ref={loupeRef} width={LOUPE_SIZE} height={LOUPE_SIZE} className="block size-[72px]" />
          {/* The sampled spot. */}
          <span className="absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)]" />
        </div>
      </div>
      {state === "loading" && <LoaderCircle className="size-5 animate-spin text-muted-foreground" />}
      {state === "error" && <span className="p-4 text-center text-xs text-muted-foreground">Couldn&apos;t load this photo.</span>}
    </div>
  );
}
