import { mapLimit } from "@/lib/catalogue/images";
import { zip, type ZipEntry } from "@/lib/zip";

import { photoSrc } from "./cutout";
import type { Product } from "./types";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Strip characters Windows and macOS don't allow in file names. */
export const safeFileName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "") || "Untitled";

/** One file per photo, in the version shown in the app: `Product (SKU)/01 Colour.jpg`. */
export function photoFiles(products: Product[], images: Record<string, string>) {
  return products.flatMap((product) => {
    const folder = safeFileName(product.sku ? `${product.name} (${product.sku})` : product.name);
    return product.photos.flatMap((photo, i) => {
      const url = photoSrc(images, photo);
      if (!url) return [];
      const variant = product.variants.find((v) => v.id === photo.variantId);
      const label = variant ? [variant.colourName, variant.style].filter(Boolean).join(" ") : "";
      const base = safeFileName(`${String(i + 1).padStart(2, "0")} ${label}`);
      return [{ url, path: `${folder}/${base}` }];
    });
  });
}

/**
 * Fetches every product photo and zips them, one folder per product. Photos
 * that fail to load are skipped and counted in `missing`. Browser-only.
 */
export async function zipProductPhotos(
  products: Product[],
  images: Record<string, string>,
  onProgress?: (done: number, total: number) => void,
) {
  const files = photoFiles(products, images);
  let done = 0;
  const entries = await mapLimit(files, 4, async ({ url, path }): Promise<ZipEntry | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const ext = EXTENSIONS[blob.type] ?? "jpg";
      return { name: `${path}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) };
    } catch {
      return null;
    } finally {
      onProgress?.(++done, files.length);
    }
  });
  const found = entries.filter((e): e is ZipEntry => !!e);
  return { blob: found.length ? zip(found) : null, count: found.length, missing: files.length - found.length };
}
