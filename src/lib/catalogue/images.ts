import type { PhotoRef } from "./model";

/**
 * Renders a catalogue photo box to a JPEG: the photo cropped to fill the box
 * (like CSS `object-fit: cover`), or the striped colour placeholder used across
 * the dashboard when there's no photo or it can't be loaded. Browser-only.
 */
async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
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

/** Matches `photoBackground()`: 135° stripes of 7% white over the colour. */
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
};

const bitmaps = new Map<string, Promise<ImageBitmap | null>>();

async function renderCanvas(ref: PhotoRef, { width, height, stripe }: RenderOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  const url = ref.imageUrl;
  if (url && !bitmaps.has(url)) bitmaps.set(url, loadBitmap(url));
  const bitmap = url ? await bitmaps.get(url)! : null;
  if (bitmap) {
    ctx.imageSmoothingQuality = "high";
    drawCover(ctx, bitmap, canvas.width, canvas.height);
  } else {
    drawPlaceholder(ctx, ref.hex, canvas.width, canvas.height, stripe ?? Math.max(6, canvas.width / 25));
  }
  return canvas;
}

export async function renderPhotoJpeg(ref: PhotoRef, options: RenderOptions): Promise<Uint8Array> {
  const canvas = await renderCanvas(ref, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", options.quality ?? 0.86));
  if (!blob) throw new Error("Couldn't prepare a photo for the catalogue.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function renderPhotoDataUrl(ref: PhotoRef, options: RenderOptions): Promise<string> {
  const canvas = await renderCanvas(ref, options);
  return canvas.toDataURL("image/jpeg", options.quality ?? 0.82);
}

/** Free decoded photos once an export finishes. */
export function releasePhotos() {
  for (const pending of bitmaps.values()) pending.then((b) => b?.close());
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
