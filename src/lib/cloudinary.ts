import "server-only";

import { createHash } from "node:crypto";

/**
 * Photo processing through Cloudinary transformations: background removal
 * (`e_background_removal`) and enhancement (`e_improve`). Cloudinary is only the
 * processor: the result goes back to the browser, which stores it beside the
 * untouched original. Uploads are named by a hash of the photo bytes, so asking
 * again for the same photo reuses the asset and its cached derived image
 * instead of paying for another transformation.
 */
export type Processed =
  | { status: "done"; image: ArrayBuffer; contentType: "image/png" | "image/jpeg" }
  /** Cloudinary is still working on it (HTTP 423); ask again shortly. */
  | { status: "processing" }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

type Config = { cloudName: string; apiKey: string; apiSecret: string };
type Transformation = { path: string; contentType: "image/png" | "image/jpeg" };

const FOLDER = "jemimas-designs/products";

export function cloudinaryConfig(env: Record<string, string | undefined> = process.env): Config | null {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/** Cloudinary's upload signature: sorted `key=value` pairs joined by `&`, then the secret, SHA-1. */
export function signParams(params: Record<string, string>, apiSecret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(payload + apiSecret).digest("hex");
}

export type ProcessOptions = {
  config?: Config | null;
  /** How long to keep retrying a 423 before reporting "processing". */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Remove a photo's background; always a transparent PNG. */
export function removeBackground(dataUrl: string, options?: ProcessOptions) {
  return transform(dataUrl, () => ({ path: "e_background_removal/f_png", contentType: "image/png" }), "remove the background", options);
}

/**
 * Improve a photo's brightness, exposure, contrast and clarity with `e_improve`:
 * automatic tonal correction, not generative, so garment details are never
 * redrawn. PNGs stay PNG so transparency survives; photos come back as JPEG at
 * Cloudinary's automatic quality, matching the uploaded photos.
 */
export function enhanceImage(dataUrl: string, options?: ProcessOptions) {
  return transform(
    dataUrl,
    (type) =>
      type === "png"
        ? { path: "e_improve/f_png", contentType: "image/png" }
        : { path: "e_improve/f_jpg/q_auto:good", contentType: "image/jpeg" },
    "enhance the photo",
    options,
  );
}

/** Persist an accepted generated image. Previews are never uploaded, so cancelling leaves nothing to clean up. */
export async function uploadAcceptedImage(
  dataUrl: string,
  { config = cloudinaryConfig() }: Pick<ProcessOptions, "config"> = {},
): Promise<{ status: "done"; url: string } | { status: "unavailable" } | { status: "failed"; message: string }> {
  if (!config) return { status: "unavailable" };
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { status: "failed", message: "That photo couldn't be read." };
  const [, , base64] = match;
  const publicId = `${FOLDER}/ironed-${createHash("sha256").update(base64).digest("hex").slice(0, 32)}`;
  const params = { overwrite: "false", public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.set(key, value);
  form.set("api_key", config.apiKey);
  form.set("signature", signParams(params, config.apiSecret));
  form.set("file", dataUrl);
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.secure_url) {
      return { status: "failed", message: body?.error?.message ?? `Cloudinary upload failed (${response.status}).` };
    }
    return { status: "done", url: body.secure_url };
  } catch {
    return { status: "failed", message: "Couldn't reach Cloudinary." };
  }
}

async function transform(
  dataUrl: string,
  transformation: (type: string) => Transformation,
  action: string,
  { config = cloudinaryConfig(), maxWaitMs = 20_000, sleep = delay }: ProcessOptions = {},
): Promise<Processed> {
  if (!config) return { status: "unavailable" };
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { status: "failed", message: "That photo couldn't be read." };
  const [, type, base64] = match;
  const { path, contentType } = transformation(type);

  const publicId = `${FOLDER}/${createHash("sha256").update(base64).digest("hex").slice(0, 32)}`;
  try {
    // overwrite=false: an already-uploaded photo is returned as is, keeping its derived images.
    const params = { overwrite: "false", public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.set(key, value);
    form.set("api_key", config.apiKey);
    form.set("signature", signParams(params, config.apiSecret));
    form.set("file", dataUrl);
    const upload = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!upload.ok) {
      const body = (await upload.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { status: "failed", message: body?.error?.message ?? `Cloudinary upload failed (${upload.status}).` };
    }

    const url = `https://res.cloudinary.com/${config.cloudName}/image/upload/${path}/${publicId}`;
    let waited = 0;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return { status: "done", image: await res.arrayBuffer(), contentType };
      if (res.status !== 423) return { status: "failed", message: `Cloudinary couldn't ${action} (${res.status}).` };
      const wait = Math.min(1000 * 2 ** attempt, 5000);
      if (waited + wait > maxWaitMs) return { status: "processing" };
      await sleep(wait);
      waited += wait;
    }
  } catch {
    return { status: "failed", message: "Couldn't reach Cloudinary." };
  }
}
