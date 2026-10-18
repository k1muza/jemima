import { PDFString, rgb, setCharacterSpacing, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import type { Catalogue } from "@/lib/inventory/types";

import type { RenderOptions } from "./images";
import type { CatalogueItem, CataloguePage, PhotoRef } from "./model";

/**
 * Drawing primitives shared by the catalogue PDF designs. Coordinates are
 * top-down (like the design), converted to pdf-lib's bottom-up space here.
 * Every design px is 0.75 pt on the 794×1123 px A4 page.
 */

export const PX = 0.75;
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
/** Photos are embedded at this many pixels per point (~180 dpi). */
const PHOTO_DENSITY = 2.5;
/** Width of the diagonal stripes on placeholders and photo backdrops. */
const STRIPE_PT = 1.875;

export const FONT_FILES = {
  serif: "InstrumentSerif-Regular.ttf",
  serifItalic: "InstrumentSerif-Italic.ttf",
  sans: "Geist-Regular.ttf",
  sansMedium: "Geist-Medium.ttf",
  mono: "GeistMono-Regular.ttf",
} as const;

export type FontName = keyof typeof FONT_FILES;
export type Fonts = Record<FontName, PDFFont>;

export function colour(hex: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0.6, 0.58, 0.54);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const clean = (text: string) => text.replace(/\s+/g, " ").trim();

// ───────────── Text ─────────────

export type TextStyle = { font: PDFFont; size: number; color: string; spacing?: number };

export function measure(text: string, { font, size, spacing = 0 }: TextStyle) {
  return font.widthOfTextAtSize(text, size) + spacing * Math.max(0, text.length - 1);
}

export const ascent = ({ font, size }: TextStyle) => font.heightAtSize(size, { descender: false });

/** Distance from the top of a line box to the baseline (CSS half-leading when `lineHeight` is set). */
export const baseline = (style: TextStyle, lineHeight?: number) =>
  (lineHeight === undefined ? 0 : (lineHeight - style.font.heightAtSize(style.size)) / 2) + ascent(style);

/** Split into lines no wider than `maxWidth`; the last allowed line ends in "…" when text is cut. */
export function wrap(text: string, style: TextStyle, maxWidth: number, maxLines = Infinity) {
  const fits = (s: string) => measure(s, style) <= maxWidth;
  const lines: string[] = [];
  let line = "";
  for (const word of clean(text).split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the box is broken.
    let rest = word;
    while (rest.length > 1 && !fits(rest)) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && !fits(`${last}…`)) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** The first line of `text` that fits, cut with "…". */
export const fit = (text: string, style: TextStyle, maxWidth: number) => wrap(text, style, maxWidth, 1)[0] ?? "";

/**
 * Draw one line at (x, top) in top-down page coordinates. With `lineHeight`,
 * `top` is the top of the line box and the glyphs are centred in it as CSS
 * does; without, `top` is the top of the glyphs.
 */
export function text(page: PDFPage, value: string, x: number, top: number, style: TextStyle, lineHeight?: number) {
  const spacing = style.spacing ?? 0;
  if (spacing) page.pushOperators(setCharacterSpacing(spacing));
  page.drawText(value, {
    x,
    y: PAGE_H - top - baseline(style, lineHeight),
    font: style.font,
    size: style.size,
    color: colour(style.color),
  });
  if (spacing) page.pushOperators(setCharacterSpacing(0));
}

/** `text`, centred on `cx`. */
export const textCentred = (page: PDFPage, value: string, cx: number, top: number, style: TextStyle, lineHeight?: number) =>
  text(page, value, cx - measure(value, style) / 2, top, style, lineHeight);

/** `text`, ending at `right`. */
export const textRight = (page: PDFPage, value: string, right: number, top: number, style: TextStyle, lineHeight?: number) =>
  text(page, value, right - measure(value, style), top, style, lineHeight);

/** Draw lines with a fixed line height; returns the block height. */
export function lines(
  page: PDFPage,
  values: string[],
  x: number,
  top: number,
  style: TextStyle,
  lineHeight: number,
  align: "left" | "centre" = "left",
) {
  values.forEach((value, i) =>
    align === "centre"
      ? textCentred(page, value, x, top + i * lineHeight, style, lineHeight)
      : text(page, value, x, top + i * lineHeight, style, lineHeight),
  );
  return values.length * lineHeight;
}

// ───────────── Shapes ─────────────

export function rect(page: PDFPage, x: number, top: number, width: number, height: number, hex: string, opacity?: number) {
  page.drawRectangle({ x, y: PAGE_H - top - height, width, height, color: colour(hex), opacity });
}

export function rule(page: PDFPage, x1: number, x2: number, top: number, hex: string, thickness = 0.75, opacity?: number) {
  page.drawLine({ start: { x: x1, y: PAGE_H - top }, end: { x: x2, y: PAGE_H - top }, thickness, color: colour(hex), opacity });
}

export function roundRect(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, hex: string) {
  const r = Math.min(radius, width / 2, height / 2);
  const k = r * 0.5523; // Bézier circle constant
  const [w, h] = [width, height];
  const path =
    `M ${r} 0 H ${w - r} C ${w - r + k} 0 ${w} ${r - k} ${w} ${r} V ${h - r} ` +
    `C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h} H ${r} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} ` +
    `V ${r} C 0 ${r - k} ${r - k} 0 ${r} 0 Z`;
  // drawSvgPath puts the path's origin at (x, y) with y running down.
  page.drawSvgPath(path, { x, y: PAGE_H - top, color: colour(hex) });
}


export function dot(page: PDFPage, x: number, top: number, diameter: number, hex: string) {
  const r = diameter / 2;
  page.drawCircle({
    x: x + r,
    y: PAGE_H - top - r,
    size: r,
    color: colour(hex),
    borderColor: rgb(0, 0, 0),
    borderOpacity: 0.15,
    borderWidth: 0.6,
  });
}

// ───────────── Photos ─────────────

export type PhotoBox = {
  ref: PhotoRef;
  width: number;
  height: number;
  shape?: RenderOptions["shape"];
  shade?: RenderOptions["shade"];
};
export type PlacedPhoto = PhotoBox & { x: number; top: number };

export type PhotoRenderer = (ref: PhotoRef, options: RenderOptions) => Promise<{ bytes: Uint8Array; type: "image/png" | "image/jpeg" }>;

export function createPhotoEmbedder(doc: PDFDocument, renderPhoto: PhotoRenderer) {
  const cache = new Map<string, Promise<PDFImage>>();
  return (box: PhotoBox) => {
    const w = Math.round(box.width * PHOTO_DENSITY);
    const h = Math.round(box.height * PHOTO_DENSITY);
    const shape = box.shape && { ...box.shape, radius: box.shape.radius && box.shape.radius * PHOTO_DENSITY };
    const key = `${box.ref.imageUrl ?? box.ref.hex}|${box.ref.backdrop ?? ""}|${w}x${h}|${JSON.stringify([shape, box.shade])}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        renderPhoto(box.ref, { width: w, height: h, stripe: STRIPE_PT * PHOTO_DENSITY, shape, shade: box.shade }).then(({ bytes, type }) =>
          type === "image/png" ? doc.embedPng(bytes) : doc.embedJpg(bytes),
        ),
      );
    }
    return cache.get(key)!;
  };
}

export async function drawImages(page: PDFPage, ctx: Context, boxes: PlacedPhoto[]) {
  const images = await Promise.all(boxes.map(ctx.photo));
  boxes.forEach((box, i) => {
    page.drawImage(images[i], { x: box.x, y: PAGE_H - box.top - box.height, width: box.width, height: box.height });
    if (box.ref.link) addLink(page, ctx.doc, box.ref.link, box);
  });
}

/** A clickable area that opens `url` (no visible border). */
function addLink(page: PDFPage, doc: PDFDocument, url: string, { x, top, width, height }: PlacedPhoto) {
  const y = PAGE_H - top - height;
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  page.node.addAnnot(doc.context.register(annot));
}

// ───────────── Colour lists ─────────────

export type DotMetrics = { dotSize: number; dotGap: number; colGap: number; rowGap: number };
type ColourFlow = { rows: { x: number; name: string; hex: string | null }[][]; height: number };

/** Lay out "● Name" entries in wrapping rows; extra colours become "+N". */
export function flowColours(
  colours: CatalogueItem["colours"],
  style: TextStyle,
  maxWidth: number,
  maxRows: number,
  { dotSize, dotGap, colGap, rowGap }: DotMetrics,
): ColourFlow {
  const rows: ColourFlow["rows"] = [];
  const entryWidth = (name: string) => dotSize + dotGap + measure(name, style);
  let row: ColourFlow["rows"][number] = [];
  let x = 0;
  let placed = 0;
  for (const c of colours) {
    const width = Math.min(entryWidth(c.name), maxWidth);
    if (row.length && x + width > maxWidth) {
      if (rows.length + 1 === maxRows) break; // no room for another row
      rows.push(row);
      row = [];
      x = 0;
    }
    row.push({ x, name: c.name, hex: c.hex });
    x += width + colGap;
    placed++;
  }
  if (row.length) rows.push(row);
  const hidden = colours.length - placed;
  if (hidden > 0 && rows.length) {
    const last = rows[rows.length - 1];
    let more = hidden;
    const tail = () => {
      const end = last[last.length - 1];
      return end.x + entryWidth(end.name) + colGap;
    };
    // Make room for the "+N" tag.
    while (last.length > 1 && tail() + measure(`+${more}`, style) > maxWidth) {
      last.pop();
      more++;
    }
    last.push({ x: tail(), name: `+${more}`, hex: null });
  }
  const lineHeight = Math.max(dotSize, style.size * 1.2);
  return { rows, height: rows.length ? rows.length * lineHeight + (rows.length - 1) * rowGap : 0 };
}

export function drawColours(page: PDFPage, flow: ColourFlow, x: number, top: number, style: TextStyle, { dotSize, dotGap, rowGap }: DotMetrics) {
  const lineHeight = Math.max(dotSize, style.size * 1.2);
  flow.rows.forEach((row, r) => {
    const rowTop = top + r * (lineHeight + rowGap);
    const textTop = rowTop + (lineHeight - style.size * 1.2) / 2 + style.size * 0.1;
    for (const entry of row) {
      if (entry.hex === null) {
        text(page, entry.name, x + entry.x, textTop, style);
        continue;
      }
      dot(page, x + entry.x, rowTop + (lineHeight - dotSize) / 2, dotSize, entry.hex);
      text(page, entry.name, x + entry.x + dotSize + dotGap, textTop, style);
    }
  });
}

/**
 * One row of colour dots with no names, cut to "+N" when they don't fit.
 * `x` is the left edge, or the centre with `align: "centre"`. Returns the row height.
 */
export function dotRow(
  page: PDFPage,
  colours: CatalogueItem["colours"],
  x: number,
  top: number,
  maxWidth: number,
  { size, gap, style, align = "left" }: { size: number; gap: number; style: TextStyle; align?: "left" | "centre" },
) {
  if (!colours.length) return 0;
  const step = size + gap;
  let shown = colours.length;
  let more = "";
  if (shown * step - gap > maxWidth) {
    // Leave room for the "+N" tag.
    shown = Math.max(1, Math.floor((maxWidth - measure(`+${colours.length}`, style)) / step));
    more = `+${colours.length - shown}`;
  }
  const width = shown * step - gap + (more ? gap + measure(more, style) : 0);
  const left = align === "centre" ? x - width / 2 : x;
  const height = Math.max(size, style.size * 1.2);
  colours.slice(0, shown).forEach((c, i) => dot(page, left + i * step, top + (height - size) / 2, size, c.hex));
  if (more) text(page, more, left + shown * step, top + (height - style.size * 1.2) / 2 + style.size * 0.1, style);
  return height;
}

// ───────────── Pages ─────────────

export type Context = {
  doc: PDFDocument;
  fonts: Fonts;
  photo: (box: PhotoBox) => Promise<PDFImage>;
  storeName: string;
  catalogue: Catalogue;
  footer: string;
  items: CatalogueItem[];
  /** "01", "02"… — the item's position in the catalogue. */
  numberOf: (item: CatalogueItem) => string;
};

export type GridPage = Extract<CataloguePage, { kind: "grid" }>;
export type FeaturePage = Extract<CataloguePage, { kind: "feature" }>;

/** How one design draws each kind of page. */
export type PdfDesign = {
  cover: (ctx: Context) => Promise<void>;
  grid: (ctx: Context, page: GridPage) => Promise<void>;
  feature: (ctx: Context, page: FeaturePage) => Promise<void>;
};

export const piecesLabel = (count: number) => `${count} ${count === 1 ? "piece" : "pieces"}`;
