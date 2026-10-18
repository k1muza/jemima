import { blobToDataUrl } from "./cutout";
import { MAX_EDIT_PIXELS } from "./refine";

/**
 * Pixel-level image helpers for the browser: decoding to RGBA, encoding PNGs,
 * and carrying transparency from one version of a photo to another.
 */

/** Decode an image to RGBA pixels. Fetching first keeps the canvas untainted (no CORS surprises). */
export async function loadPixels(url: string) {
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    blob = await res.blob();
  } catch {
    throw new Error("Couldn't load the photo. Check your connection and try again.");
  }
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const { width, height } = bitmap;
  if (width * height > MAX_EDIT_PIXELS) {
    bitmap.close();
    throw new Error("This photo is too large to edit on this device.");
  }
  const ctx = Object.assign(document.createElement("canvas"), { width, height }).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't edit images.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}

export async function pngDataUrl(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't prepare the image.");
  return blobToDataUrl(blob);
}

/**
 * The colours of `colour` with the alpha channel of `alpha` (both RGBA, same
 * size). Used after enhancing a background-removed photo: whatever the
 * processor did to transparency, the result is exactly as transparent as the
 * version it came from, so removed backgrounds and erased areas never return.
 */
export function copyAlpha(colour: Uint8ClampedArray, alpha: Uint8ClampedArray) {
  if (colour.length !== alpha.length) throw new Error("The enhanced photo doesn't match the original's size.");
  const out = new Uint8ClampedArray(colour.length);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = colour[i];
    out[i + 1] = colour[i + 1];
    out[i + 2] = colour[i + 2];
    out[i + 3] = alpha[i + 3];
  }
  return out;
}

/** `copyAlpha` for two image URLs; resolves to a PNG data URL. */
export async function withAlphaOf(colourUrl: string, alphaUrl: string) {
  const [colour, alpha] = await Promise.all([loadPixels(colourUrl), loadPixels(alphaUrl)]);
  if (colour.width !== alpha.width || colour.height !== alpha.height) {
    throw new Error("The enhanced photo doesn't match the original's size.");
  }
  return pngDataUrl(copyAlpha(colour.data, alpha.data), colour.width, colour.height);
}
