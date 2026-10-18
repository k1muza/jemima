import "server-only";

import sharp from "sharp";

import type { RenderOptions } from "./images";
import type { PhotoRef } from "./model";

/**
 * Node image renderer for the existing pdf-lib layouts. Matches the browser
 * renderer's cover crop, striped backdrops, clipping and shading without Canvas.
 * Each PDF build gets its own small source-image cache.
 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

function safeColour(value: string | undefined, fallback = "#d9d1c4") {
  return value && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value) ? value : fallback;
}

function svg(width: number, height: number, body: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

function background(width: number, height: number, colour: string, stripe: number) {
  const size = Math.max(2, stripe) * 2;
  return svg(width, height, `
    <defs><pattern id="stripe" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="${size / 2}" height="${size}" fill="white" fill-opacity=".07"/>
    </pattern></defs>
    <rect width="${width}" height="${height}" fill="${safeColour(colour)}"/>
    <rect width="${width}" height="${height}" fill="url(#stripe)"/>`);
}

function clippingMask(width: number, height: number, shape: NonNullable<RenderOptions["shape"]>) {
  if (shape.kind === "arch") {
    const radius = Math.min(width / 2, height);
    return svg(width, height, `<path fill="white" d="M 0 ${height} L 0 ${radius} A ${radius} ${radius} 0 0 1 ${width} ${radius} L ${width} ${height} Z"/>`);
  }
  const radius = Math.min(shape.radius ?? 0, width / 2, height / 2);
  return svg(width, height, `<rect width="${width}" height="${height}" rx="${radius}" fill="white"/>`);
}

function shading(width: number, height: number, stops: NonNullable<RenderOptions["shade"]>) {
  // Shading stops come only from the built-in catalogue themes.
  const entries = stops
    .map(([at, colour]) => `<stop offset="${Math.round(Math.min(1, Math.max(0, at)) * 100)}%" stop-color="${colour}"/>`)
    .join("");
  return svg(width, height, `<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">${entries}</linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#shade)"/>`);
}

function trustedStorageUrl(value: string) {
  try {
    const url = new URL(value);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;
    const allowed = new URL(supabaseUrl);
    return url.protocol === "https:" && url.origin === allowed.origin && url.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}

async function downloadImage(url: string) {
  if (!trustedStorageUrl(url)) throw new Error("A catalogue photo has an unsupported storage URL.");
  const response = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Couldn't retrieve a catalogue photo (HTTP ${response.status}).`);
  const expected = Number(response.headers.get("content-length") ?? 0);
  if (expected > MAX_SOURCE_BYTES) throw new Error("A catalogue photo is too large to process.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Couldn't read a catalogue photo.");
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error("A catalogue photo is too large to process.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((part) => Buffer.from(part)), received);
}

export function createServerPhotoRenderer() {
  const sources = new Map<string, Promise<Buffer>>();

  return async function renderPhoto(
    ref: PhotoRef,
    { width, height, stripe, shape, shade, quality }: RenderOptions,
  ): Promise<{ bytes: Uint8Array; type: "image/png" | "image/jpeg" }> {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const layers: { input: Buffer; blend: "over" }[] = [];
    let sourceHasAlpha = false;

    if (ref.imageUrl) {
      if (!sources.has(ref.imageUrl)) sources.set(ref.imageUrl, downloadImage(ref.imageUrl));
      const source = await sources.get(ref.imageUrl)!;
      if (ref.backdrop) {
        layers.push({ input: background(w, h, ref.backdrop, stripe ?? 2), blend: "over" });
      }
      const photo = await sharp(source)
        .rotate()
        .resize(w, h, { fit: "cover", position: "centre" })
        .ensureAlpha()
        .png()
        .toBuffer();
      layers.push({ input: photo, blend: "over" });
    } else {
      layers.push({ input: background(w, h, ref.hex, stripe ?? 2), blend: "over" });
    }

    if (shade?.length) layers.push({ input: shading(w, h, shade), blend: "over" });

    let rendered = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(layers).png().toBuffer();

    if (shape) {
      rendered = await sharp(rendered)
        .composite([{ input: clippingMask(w, h, shape), blend: "dest-in" }])
        .png()
        .toBuffer();
    }

    if (shape?.matte) {
      rendered = await sharp({
        create: { width: w, height: h, channels: 4, background: safeColour(shape.matte) },
      }).composite([{ input: rendered, blend: "over" }]).jpeg({ quality: Math.round((quality ?? 0.86) * 100) }).toBuffer();
      return { bytes: rendered, type: "image/jpeg" };
    }

    // Keep alpha where the original was a cutout or the theme clips the photo.
    const transparent = !!shape || (!!ref.imageUrl && !ref.backdrop);
    if (transparent) return { bytes: rendered, type: "image/png" };
    return { bytes: await sharp(rendered).jpeg({ quality: Math.round((quality ?? 0.86) * 100) }).toBuffer(), type: "image/jpeg" };
  };
}
