/**
 * How light the garment in a background-removed photo is, so its backdrop can
 * be chosen to contrast with it. Browser-only; results are cached per URL.
 */

const SAMPLE = 64;
/** Pixels at least this opaque count as the garment. */
const OPAQUE = 160;
/** Below this share of see-through pixels the photo isn't a cutout, so no backdrop shows. */
const MIN_TRANSPARENT = 0.03;

const cache = new Map<string, Promise<number | null>>();

/** Average luminance (0–1) of the garment's pixels, or null when the photo isn't a cutout. */
export function photoLuminance(url: string): Promise<number | null> {
  if (!cache.has(url)) {
    const pending = measure(url).catch(() => null);
    cache.set(url, pending);
  }
  return cache.get(url)!;
}

async function measure(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, SAMPLE, SAMPLE);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  let clear = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 255) clear++;
    if (alpha < OPAQUE) continue;
    sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    count++;
  }
  if (clear / (SAMPLE * SAMPLE) < MIN_TRANSPARENT || !count) return null;
  return sum / count;
}

/** Garment luminance for each cutout among `urls`; photos that aren't cutouts are left out. */
export async function photoLuminances(urls: Iterable<string>) {
  const unique = [...new Set(urls)];
  const values = await Promise.all(unique.map(photoLuminance));
  const tones: Record<string, number> = {};
  unique.forEach((url, i) => {
    if (values[i] !== null) tones[url] = values[i];
  });
  return tones;
}
