import type { PhotoRef } from "./model";

/**
 * Renders a catalogue photo box to an image: the photo cropped to fill the box
 * (like CSS `object-fit: cover`), or the striped colour placeholder used across
 * the dashboard when there's no photo or it can't be loaded. Photos come out as
 * JPEG; PNG sources (background-removed copies) are laid on the ref's
 * backdrop colour, or stay PNG to keep their transparency when it has none.
 * Browser-only.
 */
type Loaded = { bitmap: ImageBitmap; transparent: boolean };

async function loadBitmap(url: string): Promise<Loaded | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return { bitmap: await createImageBitmap(blob), transparent: blob.type === "image/png" };
  } catch {
    return null;
  }
}

function drawCover(ctx: CanvasRenderingContext2D, image: ImageBitmap, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

/** 135° stripes of 7% white over the colour, like `photoBackground()` (catalogue stripes are narrower). */
function drawPlaceholder(ctx: CanvasRenderingContext2D, hex: string, width: number, height: number, stripe: number) {
  ctx.fillStyle = hex || "#d9d1c4";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  const reach = Math.hypot(width, height);
  for (let x = -reach; x < reach; x += stripe * 2) ctx.fillRect(x, -reach, stripe, reach * 2);
  ctx.restore();
}

export type RenderOptions = {
  width: number;
  height: number;
  /** Placeholder stripe width in output pixels. */
  stripe?: number;
  quality?: number;
  /**
   * Clip the photo to an arch (semicircular top) or a rounded rectangle of
   * `radius` px. The cut-away corners are filled with `matte` (the page colour
   * behind the photo), or left transparent without one.
   */
  shape?: { kind: "arch" | "rounded"; radius?: number; matte?: string };
  /** A top-to-bottom shading over the photo: [position 0–1, rgba colour] stops. */
  shade?: [number, string][];
};

function clipShape(ctx: CanvasRenderingContext2D, { kind, radius = 0 }: NonNullable<RenderOptions["shape"]>, width: number, height: number) {
  ctx.beginPath();
  if (kind === "arch") {
    const r = Math.min(width / 2, height);
    ctx.moveTo(0, height);
    ctx.lineTo(0, r);
    ctx.arc(width / 2, r, width / 2, Math.PI, 0);
    ctx.lineTo(width, height);
  } else {
    ctx.roundRect(0, 0, width, height, Math.min(radius, width / 2, height / 2));
  }
  ctx.closePath();
  ctx.clip();
}

const bitmaps = new Map<string, Promise<Loaded | null>>();

async function renderCanvas(ref: PhotoRef, { width, height, stripe, shape, shade }: RenderOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  const url = ref.imageUrl;
  if (url && !bitmaps.has(url)) bitmaps.set(url, loadBitmap(url));
  const loaded = url ? await bitmaps.get(url)! : null;
  if (shape) {
    if (shape.matte) {
      ctx.fillStyle = shape.matte;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    clipShape(ctx, shape, canvas.width, canvas.height);
  }
  if (loaded) {
    // The backdrop gets the same diagonal stripes as the colour placeholder.
    if (ref.backdrop) drawPlaceholder(ctx, ref.backdrop, canvas.width, canvas.height, stripe ?? Math.max(2, canvas.width / 100));
    ctx.imageSmoothingQuality = "high";
    drawCover(ctx, loaded.bitmap, canvas.width, canvas.height);
  } else {
    drawPlaceholder(ctx, ref.hex, canvas.width, canvas.height, stripe ?? Math.max(2, canvas.width / 100));
  }
  if (shade) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (const [at, colour] of shade) gradient.addColorStop(at, colour);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const transparent = (loaded?.transparent && !ref.backdrop) || (shape && !shape.matte);
  return { canvas, type: transparent ? ("image/png" as const) : ("image/jpeg" as const) };
}

export async function renderPhoto(ref: PhotoRef, options: RenderOptions) {
  const { canvas, type } = await renderCanvas(ref, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, options.quality ?? 0.86));
  if (!blob) throw new Error("Couldn't prepare a photo for the catalogue.");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type };
}

export async function renderPhotoDataUrl(ref: PhotoRef, options: RenderOptions): Promise<string> {
  const { canvas, type } = await renderCanvas(ref, options);
  return canvas.toDataURL(type, options.quality ?? 0.82);
}

/** Free decoded photos once an export finishes. */
export function releasePhotos() {
  for (const pending of bitmaps.values()) pending.then((b) => b?.bitmap.close());
  bitmaps.clear();
}

/** Run `fn` over `items` with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Trigger a browser download. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
