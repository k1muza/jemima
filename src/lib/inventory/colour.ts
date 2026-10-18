import type { Product, Variant } from "./types";

export const NAMED_COLOURS: readonly [name: string, hex: string][] = [
  ["Black", "#1d1d1f"], ["Charcoal", "#3f3f42"], ["Grey", "#8e8e8e"], ["Silver", "#c4c4c4"],
  ["White", "#f4f2ee"], ["Ivory", "#efe8d8"], ["Cream", "#e8dcc0"], ["Beige", "#d6c4a3"],
  ["Sand", "#cdb991"], ["Camel", "#b08653"], ["Tan", "#a87650"], ["Brown", "#6b4a33"],
  ["Chocolate", "#4a3326"], ["Olive", "#5b5a3a"], ["Khaki", "#a39e6e"], ["Sage", "#9caf88"],
  ["Green", "#3f7a4a"], ["Forest", "#2f4a3a"], ["Mint", "#a6dcc6"], ["Aqua", "#4fbfb4"],
  ["Teal", "#2f6f73"], ["Sky", "#a9c3d8"],
  ["Blue", "#3b5ea8"], ["Denim", "#4a6283"], ["Navy", "#25304a"], ["Lilac", "#b8a6cf"],
  ["Purple", "#5e3f7a"], ["Pink", "#e8b4bc"], ["Rose", "#c97a86"], ["Red", "#b0322c"],
  ["Burgundy", "#6a2330"], ["Rust", "#9a4a2a"], ["Orange", "#d9772b"], ["Mustard", "#c9a03a"],
  ["Yellow", "#e8cf55"], ["Coral", "#e07a63"],
];

/** Photos closer than this to an existing variant's colour join that variant. */
const SAME_COLOUR_DISTANCE = 95;

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);

const rgbToHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
    .join("");

/** Perceptually weighted RGB distance ("redmean"). */
export function colourDistance(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function nameColour(hex: string) {
  let best = NAMED_COLOURS[0];
  let bestDistance = Infinity;
  for (const named of NAMED_COLOURS) {
    const d = colourDistance(hex, named[1]);
    if (d < bestDistance) {
      bestDistance = d;
      best = named;
    }
  }
  return best[0];
}

/** "#abc" / "abcdef" / "#ABCDEF" → "#abcdef", or null when it isn't a hex colour. */
export function normaliseHex(input: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return "#" + h.toLowerCase();
}

/**
 * Average colour of the opaque pixels within `radius` of (x, y) in RGBA data.
 * Averaging a small patch smooths out fabric texture and JPEG noise; fully
 * transparent pixels (removed backgrounds) are ignored. Null when nothing opaque is there.
 */
export function sampleColour(
  image: { data: ArrayLike<number>; width: number; height: number },
  x: number,
  y: number,
  radius = 2,
) {
  const { data, width, height } = image;
  const cx = Math.round(x), cy = Math.round(y);
  let r = 0, g = 0, b = 0, n = 0;
  for (let py = Math.max(0, cy - radius); py <= Math.min(height - 1, cy + radius); py++) {
    for (let px = Math.max(0, cx - radius); px <= Math.min(width - 1, cx + radius); px++) {
      const k = (py * width + px) * 4;
      if (data[k + 3] < 128) continue;
      r += data[k]; g += data[k + 1]; b += data[k + 2]; n++;
    }
  }
  return n ? rgbToHex(r / n, g / n, b / n) : null;
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

type Rgb = [r: number, g: number, b: number];

const bucketOf = (r: number, g: number, b: number) => ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);

/**
 * The background colours of a photo: every colour that covers a good share of
 * the outer edge (a floor and a wall, a rug and its shadow). Averaging the edge
 * into one colour instead would match neither part, and the background would
 * then be mistaken for the garment. A colour that is also common in the middle
 * of the frame (at least half as common there as at the edge) is the garment
 * filling the shot, not background.
 */
export function backgroundColours(image: { data: ArrayLike<number>; width: number; height: number }, minShare = 0.08): Rgb[] {
  const { data: d, width: W, height: H } = image;
  const band = Math.max(1, Math.round(Math.min(W, H) * 0.06));
  const edge = new Map<number, { n: number; r: number; g: number; b: number }>();
  const centre = new Map<number, number>();
  let edgeTotal = 0, centreTotal = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      if (d[k + 3] < 128) continue;
      const key = bucketOf(d[k], d[k + 1], d[k + 2]);
      if (x >= band && x < W - band && y >= band && y < H - band) {
        if (x >= W / 4 && x < (3 * W) / 4 && y >= H / 4 && y < (3 * H) / 4) {
          centre.set(key, (centre.get(key) ?? 0) + 1);
          centreTotal++;
        }
        continue;
      }
      const e = edge.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += d[k]; e.g += d[k + 1]; e.b += d[k + 2];
      edge.set(key, e);
      edgeTotal++;
    }
  }
  return [...edge]
    .filter(([key, e]) => e.n >= edgeTotal * minShare && (centre.get(key) ?? 0) / Math.max(1, centreTotal) < (0.5 * e.n) / edgeTotal)
    .map(([, e]) => [e.r / e.n, e.g / e.n, e.b / e.n]);
}

/**
 * Predominant garment colour: ignores pixels close to any background colour
 * and weights the centre of the frame. Null when nothing but background is found.
 */
export function garmentColour(image: { data: ArrayLike<number>; width: number; height: number }) {
  const { data: d, width: W, height: H } = image;
  const background = backgroundColours(image);
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  let opaque = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      if (d[k + 3] < 128) continue;
      opaque++;
      const r = d[k], g = d[k + 1], b = d[k + 2];
      if (background.some(([br, bg, bb]) => Math.hypot(r - br, g - bg, b - bb) < 48)) continue;
      const w = 1.6 - Math.min(1, Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)));
      const key = bucketOf(r, g, b);
      const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
      e.w += w; e.r += r * w; e.g += g * w; e.b += b * w;
      buckets.set(key, e);
    }
  }
  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
  return best && best.w > opaque * 0.005 ? rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w) : null;
}

function dominantColour(img: HTMLImageElement) {
  const N = 64;
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, N, N);
  const image = ctx.getImageData(0, 0, N, N);
  return garmentColour(image) ?? sampleColour(image, N / 2, N / 2, N / 4) ?? "#9a948a";
}

function loadImage(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Downscale for storage and detect the garment colour. */
export async function processPhoto(file: File) {
  const img = await loadImage(file);
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), hex: dominantColour(img) };
}

/**
 * Rotate a stored photo a quarter turn clockwise; returns the new data URL.
 * JPEG by default; "image/png" keeps the transparency of background-removed copies.
 */
export async function rotatePhoto(src: string, type: "image/jpeg" | "image/png" = "image/jpeg") {
  const img = await loadImage(await (await fetch(src)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL(type, 0.92);
}

/**
 * Attach a photo to the closest-coloured variant, or start a new colour row.
 * Never renames an existing variant, so user corrections are preserved.
 */
export function attachPhoto(product: Product, photoId: string, hex: string, newId: () => string): Product {
  let closest: Variant | null = null;
  let closestDistance = Infinity;
  for (const v of product.variants) {
    const d = colourDistance(v.colourHex, hex);
    if (d < closestDistance) {
      closestDistance = d;
      closest = v;
    }
  }

  let variants = product.variants;
  let variantId: string;
  if (closest && closestDistance < SAME_COLOUR_DISTANCE) {
    variantId = closest.id;
  } else {
    variantId = newId();
    variants = [...variants, newVariant(product.sizes, variantId, nameColour(hex), hex)];
  }

  return { ...product, variants, photos: [...product.photos, { id: photoId, variantId, hex }] };
}

export function newVariant(sizes: string[], id: string, colourName: string, colourHex: string): Variant {
  return {
    id,
    colourName,
    colourHex,
    colourStatus: "detected",
    style: "",
    qty: Object.fromEntries(sizes.map((s) => [s, 0])),
  };
}
