/**
 * Small copies of photo files for lists and cards, which show photos a few
 * hundred pixels wide at most. Each stored file gets one beside it
 * (`<path>.thumb`), written whenever the file is. Photos saved to Cloudinary
 * (accepted ironing) are resized by Cloudinary's URL instead.
 *
 * Thumbnails are looked up by the exact URL of the full file they were made
 * from, so a photo just edited on this device (a local data URL) shows the new
 * file, never an outdated thumbnail.
 */

/** Longest edge in pixels: sharp on a ~300px card on a 2× screen. */
export const THUMB_EDGE = 640;

/** The URL to show where a photo is small: its thumbnail when there is one, else the full file. */
export function thumbSrc(thumbs: Record<string, string>, url: string | undefined) {
  if (!url) return undefined;
  return thumbs[url] ?? cloudinaryThumbUrl(url) ?? url;
}

/** A resized Cloudinary delivery URL (cached by Cloudinary after the first request), or null for other URLs. */
export function cloudinaryThumbUrl(url: string) {
  const match = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url);
  return match ? `${match[1]}c_limit,w_${THUMB_EDGE},h_${THUMB_EDGE}/f_auto,q_auto/${match[2]}` : null;
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A WebP thumbnail of an image file, keeping transparency. Browsers that can't
 * write WebP (Safari) get JPEG for photos and PNG for transparent images.
 * Browser-only.
 */
export async function makeThumbnail(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't draw images.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const webp = await encode(canvas, "image/webp", 0.8);
    if (webp?.type === "image/webp") return webp;
    const fallback = source.type === "image/jpeg" ? await encode(canvas, "image/jpeg", 0.82) : await encode(canvas, "image/png");
    if (!fallback) throw new Error("Couldn't make a thumbnail.");
    return fallback;
  } finally {
    bitmap.close();
  }
}
