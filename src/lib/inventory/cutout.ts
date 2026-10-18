import type { Photo } from "./types";

/**
 * Background-removed copies ("cutouts") of photos. Opt-in per photo: the
 * original is never replaced, and both files sit in `images` side by side —
 * the original under the photo id, the cutout under `cutoutKey(id)` — so
 * switching between them is instant and never calls Cloudinary again.
 *
 * A cutout can also be refined by hand (see `refine.ts`): the cutout stays as
 * the base, `maskKey(id)` holds what was erased, and `refinedKey(id)` the result.
 *
 * Each of those versions can be enhanced (`e_improve`); the enhanced copy sits
 * beside it under `enhancedKey(id, version)`, so undoing is instant too.
 */
export const cutoutKey = (photoId: string) => `${photoId}:cutout`;
export const refinedKey = (photoId: string) => `${photoId}:refined`;
export const maskKey = (photoId: string) => `${photoId}:mask`;
export const ironedKey = (photoId: string) => `${photoId}:ironed`;

/** The displayable versions of a photo, each of which may also be shown enhanced. */
export type PhotoVersion = "original" | "cutout" | "refined";
export const versionKey = (photoId: string, version: PhotoVersion) =>
  version === "original" ? photoId : version === "cutout" ? cutoutKey(photoId) : refinedKey(photoId);
export const enhancedKey = (photoId: string, version: PhotoVersion) => `${versionKey(photoId, version)}:enhanced`;

/** Every file a photo may have. */
export const photoKeys = (photoId: string) => [
  photoId,
  ironedKey(photoId),
  cutoutKey(photoId),
  refinedKey(photoId),
  maskKey(photoId),
  ...(["original", "cutout", "refined"] as const).map((v) => enhancedKey(photoId, v)),
];

/**
 * The version a photo is on: when the background-removed version is chosen,
 * its refinement (if any) or the plain cutout; otherwise the original. Falls
 * back to the original when a chosen file isn't loaded.
 */
export function currentVersion(
  images: Record<string, string>,
  photo: Pick<Photo, "id" | "showCutout" | "refined">,
): PhotoVersion {
  if (!photo.showCutout || !images[cutoutKey(photo.id)]) return "original";
  return photo.refined && images[refinedKey(photo.id)] ? "refined" : "cutout";
}

/**
 * The image to show for a photo: its current version, enhanced when that is
 * chosen and the enhanced copy exists. `enhanced` overrides the saved choice
 * (for an unsaved preview).
 */
export function photoSrc(
  images: Record<string, string>,
  photo: Pick<Photo, "id" | "showCutout" | "refined" | "enhanced" | "showIroned">,
  enhanced = photo.enhanced,
): string | undefined {
  if (photo.showIroned && images[ironedKey(photo.id)]) return images[ironedKey(photo.id)];
  const version = currentVersion(images, photo);
  return (enhanced && images[enhancedKey(photo.id, version)]) || images[versionKey(photo.id, version)];
}

export async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

/** A data URL for an image (saved photos are signed URLs; the API routes take image data). */
export async function toDataUrl(url: string) {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load that photo.");
  return blobToDataUrl(await res.blob());
}

/** How many times to ask again while Cloudinary is still processing (each ask waits up to ~20s server-side). */
const PROCESSING_RETRIES = 6;

type RequestOptions = { sleep?: (ms: number) => Promise<void> };

/** Send a photo to one of the Cloudinary API routes; resolves to the result as a data URL. */
async function requestProcessed(
  endpoint: string,
  image: string,
  fallbackError: string,
  { sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }: RequestOptions = {},
): Promise<string> {
  const body = JSON.stringify({ image: await toDataUrl(image) });
  for (let attempt = 0; attempt <= PROCESSING_RETRIES; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status === 200) return blobToDataUrl(await res.blob());
    if (res.status !== 202) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(error || fallbackError);
    }
    await sleep(3000);
  }
  throw new Error("Cloudinary is taking too long. Try again in a minute.");
}

/** Remove a photo's background; resolves to the PNG as a data URL. */
export const requestCutout = (image: string, options?: RequestOptions) =>
  requestProcessed("/api/background-removal", image, "Couldn't remove the background.", options);

/** Enhance a photo (`e_improve`); a PNG comes back as PNG, a photo as JPEG. */
export const requestEnhanced = (image: string, options?: RequestOptions) =>
  requestProcessed("/api/enhance", image, "Couldn't enhance the photo.", options);

/** Request exactly one AI edit. The result is only a preview until the caller accepts it. */
export const requestIroned = (image: string, options?: RequestOptions) =>
  requestProcessed("/api/iron-clothes", image, "Couldn't iron the clothes.", options);
