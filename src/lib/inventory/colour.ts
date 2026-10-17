import type { Product, Variant } from "./types";

const NAMED_COLOURS: [name: string, hex: string][] = [
  ["Black", "#1d1d1f"], ["Charcoal", "#3f3f42"], ["Grey", "#8e8e8e"], ["Silver", "#c4c4c4"],
  ["White", "#f4f2ee"], ["Ivory", "#efe8d8"], ["Cream", "#e8dcc0"], ["Beige", "#d6c4a3"],
  ["Sand", "#cdb991"], ["Camel", "#b08653"], ["Tan", "#a87650"], ["Brown", "#6b4a33"],
  ["Chocolate", "#4a3326"], ["Olive", "#5b5a3a"], ["Khaki", "#a39e6e"], ["Sage", "#9caf88"],
  ["Green", "#3f7a4a"], ["Forest", "#2f4a3a"], ["Teal", "#2f6f73"], ["Sky", "#a9c3d8"],
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

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Predominant garment colour: ignores pixels close to the average border
 * colour (the background) and weights the centre of the frame.
 */
function dominantColour(img: HTMLImageElement) {
  const N = 64;
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;

  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let i = 0; i < N; i++) {
    for (const [px, py] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
      const k = (py * N + px) * 4;
      br += d[k]; bg += d[k + 1]; bb += d[k + 2]; bn++;
    }
  }
  br /= bn; bg /= bn; bb /= bn;

  const buckets: Record<number, { w: number; r: number; g: number; b: number }> = {};
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      if (d[k + 3] < 128) continue;
      const r = d[k], g = d[k + 1], b = d[k + 2];
      if (Math.hypot(r - br, g - bg, b - bb) < 42) continue;
      const w = 1.6 - Math.min(1, Math.hypot((x - N / 2) / (N / 2), (y - N / 2) / (N / 2)));
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const e = (buckets[key] ??= { w: 0, r: 0, g: 0, b: 0 });
      e.w += w; e.r += r * w; e.g += g * w; e.b += b * w;
    }
  }

  let best: (typeof buckets)[number] | null = null;
  for (const e of Object.values(buckets)) if (!best || e.w > best.w) best = e;
  return best && best.w > 20 ? rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w) : rgbToHex(br, bg, bb);
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

/** Rotate a stored photo a quarter turn clockwise; returns the new JPEG data URL. */
export async function rotatePhoto(src: string) {
  const img = await loadImage(await (await fetch(src)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
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
