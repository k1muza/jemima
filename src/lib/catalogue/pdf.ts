import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import type { Catalogue } from "@/lib/inventory/types";

import { releasePhotos, renderPhotoJpeg } from "./images";
import {
  catalogueFooter,
  cataloguePages,
  coverPhoto,
  type CatalogueItem,
  type CataloguePage,
  type PhotoRef,
} from "./model";

/**
 * Builds the printable catalogue as an A4 PDF with pdf-lib, following the
 * design's print pages (794×1123 px, so every design px is 0.75 pt).
 * Browser-only: photos are cropped on a canvas before they're embedded.
 */

const PX = 0.75;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** Photos are embedded at this many pixels per point (~180 dpi). */
const PHOTO_DENSITY = 2.5;

const INK = {
  ink: "#1a1714",
  paper: "#fffdf9",
  line: "#e5dfd5",
  muted: "#6b645b",
  subtle: "#8a8278",
  coverBg: "#1a1714",
  coverInk: "#f2ede4",
  coverMuted: "#9a9186",
  coverSub: "#c9c0b3",
};

const FONT_FILES = {
  serif: "InstrumentSerif-Regular.ttf",
  serifItalic: "InstrumentSerif-Italic.ttf",
  sans: "Geist-Regular.ttf",
  sansMedium: "Geist-Medium.ttf",
  mono: "GeistMono-Regular.ttf",
} as const;

type FontName = keyof typeof FONT_FILES;
type Fonts = Record<FontName, PDFFont>;

let fontBytes: Promise<Record<FontName, ArrayBuffer>> | null = null;

function loadFontBytes() {
  fontBytes ??= Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) => {
      const response = await fetch(`/fonts/catalogue/${FONT_FILES[name]}`);
      if (!response.ok) throw new Error("Couldn't load the catalogue fonts. Check your connection and try again.");
      return [name, await response.arrayBuffer()] as const;
    }),
  )
    .then((entries) => Object.fromEntries(entries) as Record<FontName, ArrayBuffer>)
    .catch((error) => {
      fontBytes = null; // retry next time
      throw error;
    });
  return fontBytes;
}

function colour(hex: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0.6, 0.58, 0.54);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

// ───────────── Text ─────────────

type TextStyle = { font: PDFFont; size: number; color: string; spacing?: number };

function measure(text: string, { font, size, spacing = 0 }: TextStyle) {
  return font.widthOfTextAtSize(text, size) + spacing * Math.max(0, text.length - 1);
}

const ascent = ({ font, size }: TextStyle) => font.heightAtSize(size, { descender: false });

/** Distance from the top of a line box to the baseline (CSS half-leading when `lineHeight` is set). */
const baseline = (style: TextStyle, lineHeight?: number) =>
  (lineHeight === undefined ? 0 : (lineHeight - style.font.heightAtSize(style.size)) / 2) + ascent(style);

/** Split into lines no wider than `maxWidth`; the last allowed line ends in "…" when text is cut. */
function wrap(text: string, style: TextStyle, maxWidth: number, maxLines = Infinity) {
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

/**
 * Draw one line at (x, top) in top-down page coordinates. With `lineHeight`,
 * `top` is the top of the line box and the glyphs are centred in it as CSS
 * does; without, `top` is the top of the glyphs.
 */
function text(page: PDFPage, value: string, x: number, top: number, style: TextStyle, lineHeight?: number) {
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

/** Draw lines with a fixed line height; returns the block height. */
function lines(page: PDFPage, values: string[], x: number, top: number, style: TextStyle, lineHeight: number) {
  values.forEach((value, i) => text(page, value, x, top + i * lineHeight, style, lineHeight));
  return values.length * lineHeight;
}

// ───────────── Shapes & photos ─────────────

function rect(page: PDFPage, x: number, top: number, width: number, height: number, hex: string) {
  page.drawRectangle({ x, y: PAGE_H - top - height, width, height, color: colour(hex) });
}

function dot(page: PDFPage, x: number, top: number, diameter: number, hex: string) {
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

type PhotoBox = { ref: PhotoRef; width: number; height: number };

function createPhotoEmbedder(doc: PDFDocument) {
  const cache = new Map<string, Promise<PDFImage>>();
  return (box: PhotoBox) => {
    const w = Math.round(box.width * PHOTO_DENSITY);
    const h = Math.round(box.height * PHOTO_DENSITY);
    const key = `${box.ref.imageUrl ?? box.ref.hex}|${w}x${h}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        renderPhotoJpeg(box.ref, { width: w, height: h, stripe: 7.5 * PHOTO_DENSITY }).then((bytes) => doc.embedJpg(bytes)),
      );
    }
    return cache.get(key)!;
  };
}

// ───────────── Colour lists ─────────────

type ColourFlow = { rows: { x: number; name: string; hex: string | null }[][]; height: number };

/** Lay out "● Name" entries in wrapping rows; extra colours become "+N". */
function flowColours(
  colours: CatalogueItem["colours"],
  style: TextStyle,
  maxWidth: number,
  maxRows: number,
  { dotSize, dotGap, colGap, rowGap }: { dotSize: number; dotGap: number; colGap: number; rowGap: number },
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

function drawColours(page: PDFPage, flow: ColourFlow, x: number, top: number, style: TextStyle, dotSize: number, dotGap: number, rowGap: number) {
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

// ───────────── Pages ─────────────

type Context = {
  doc: PDFDocument;
  fonts: Fonts;
  photo: (box: PhotoBox) => Promise<PDFImage>;
  storeName: string;
  catalogue: Catalogue;
  footer: string;
};

const PAD_TOP = 52 * PX;
const PAD_X = 56 * PX;
const PAD_BOTTOM = 40 * PX;
const CONTENT_W = PAGE_W - PAD_X * 2;
const BLOCK_GAP = 30 * PX;

async function drawImages(page: PDFPage, ctx: Context, boxes: (PhotoBox & { x: number; top: number })[]) {
  const images = await Promise.all(boxes.map(ctx.photo));
  boxes.forEach((box, i) =>
    page.drawImage(images[i], { x: box.x, y: PAGE_H - box.top - box.height, width: box.width, height: box.height }),
  );
}

async function drawCover(ctx: Context, items: CatalogueItem[]) {
  const { doc, fonts, catalogue, storeName } = ctx;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const pad = 56 * PX;
  const width = PAGE_W - pad * 2;
  rect(page, 0, 0, PAGE_W, PAGE_H, INK.coverBg);

  const top: TextStyle = { font: fonts.mono, size: 12 * PX, color: INK.coverMuted, spacing: 12 * PX * 0.1 };
  const pieces = `${items.length} ${items.length === 1 ? "piece" : "pieces"}`.toUpperCase();
  text(page, clean(storeName).toUpperCase(), pad, pad, top);
  text(page, pieces, PAGE_W - pad - measure(pieces, top), pad, top);

  // Title and subtitle sit at the bottom; the photo fills the space between.
  const titleStyle: TextStyle = { font: fonts.serifItalic, size: 96 * PX, color: INK.coverInk, spacing: -96 * PX * 0.02 };
  const subStyle: TextStyle = { font: fonts.sans, size: 18 * PX, color: INK.coverSub };
  const titleLines = wrap(catalogue.title || catalogue.name, titleStyle, width, 3);
  const subLines = catalogue.subtitle.trim() ? wrap(catalogue.subtitle, subStyle, width, 3) : [];
  const titleLh = titleStyle.size * 0.92;
  const subLh = subStyle.size * 1.35;
  const blockH = titleLines.length * titleLh + (subLines.length ? 14 * PX + subLines.length * subLh : 0);
  const blockTop = PAGE_H - pad - blockH;
  lines(page, titleLines, pad, blockTop, titleStyle, titleLh);
  if (subLines.length) lines(page, subLines, pad, blockTop + titleLines.length * titleLh + 14 * PX, subStyle, subLh);

  const gap = 36 * PX;
  const photoTop = pad + top.size * 1.3 + gap;
  const photoH = blockTop - gap - photoTop;
  if (photoH > 40) await drawImages(page, ctx, [{ ref: coverPhoto(items), x: pad, top: photoTop, width, height: photoH }]);
}

/** Store name / catalogue title header and the footer; returns the content box. */
function drawFrame(ctx: Context, page: PDFPage, number: number) {
  const { fonts, catalogue, storeName } = ctx;
  rect(page, 0, 0, PAGE_W, PAGE_H, INK.paper);

  const store: TextStyle = { font: fonts.serifItalic, size: 26 * PX, color: INK.ink };
  const label: TextStyle = { font: fonts.mono, size: 11 * PX, color: INK.subtle, spacing: 11 * PX * 0.08 };
  const storeText = wrap(storeName, store, CONTENT_W * 0.55, 1)[0] ?? "";
  text(page, storeText, PAD_X, PAD_TOP, store);
  const titleText = wrap((catalogue.title || catalogue.name).toUpperCase(), label, CONTENT_W * 0.4, 1)[0] ?? "";
  // Baseline-aligned with the store name.
  const baseline = PAD_TOP + ascent(store);
  text(page, titleText, PAGE_W - PAD_X - measure(titleText, label), baseline - ascent(label), label);
  const ruleTop = PAD_TOP + store.size * 1.15 + 14 * PX;
  page.drawLine({
    start: { x: PAD_X, y: PAGE_H - ruleTop },
    end: { x: PAGE_W - PAD_X, y: PAGE_H - ruleTop },
    thickness: 0.75,
    color: colour(INK.line),
  });

  const foot: TextStyle = { font: fonts.mono, size: 10 * PX, color: INK.subtle, spacing: 10 * PX * 0.06 };
  const footTop = PAGE_H - PAD_BOTTOM - foot.size * 1.2;
  const footText = wrap(ctx.footer.toUpperCase(), foot, CONTENT_W * 0.7, 1)[0] ?? "";
  text(page, footText, PAD_X, footTop, foot);
  const no = `PAGE ${number}`;
  text(page, no, PAGE_W - PAD_X - measure(no, foot), footTop, foot);

  return { top: ruleTop + BLOCK_GAP, bottom: footTop - BLOCK_GAP };
}

async function drawGridPage(ctx: Context, page: Extract<CataloguePage, { kind: "grid" }>) {
  const { doc, fonts, catalogue } = ctx;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = drawFrame(ctx, pdfPage, page.number);

  const cols = 3;
  const colGap = 22 * PX;
  const rowGap = 34 * PX;
  const gap = 10 * PX;
  const colW = (CONTENT_W - colGap * (cols - 1)) / cols;
  const photoH = colW * 1.25;
  const name: TextStyle = { font: fonts.serif, size: 21 * PX, color: INK.ink };
  const nameLh = name.size * 1.1;
  const price: TextStyle = { font: fonts.sansMedium, size: 14 * PX, color: INK.ink };
  const col: TextStyle = { font: fonts.sans, size: 11 * PX, color: INK.muted };
  const dots = { dotSize: 9 * PX, dotGap: 6 * PX, colGap: 12 * PX, rowGap: 5 * PX };

  const cells = page.items.map((item) => {
    const priceText = catalogue.showPrices ? item.price : "";
    const priceW = priceText ? measure(priceText, price) + gap : 0;
    const nameLines = wrap(item.name, name, colW - priceW, 2);
    const flow = catalogue.showColours ? flowColours(item.colours, col, colW, 2, dots) : null;
    const height = photoH + gap + nameLines.length * nameLh + (flow?.height ? gap + flow.height : 0);
    return { item, priceText, nameLines, flow, height };
  });

  const boxes: (PhotoBox & { x: number; top: number })[] = [];
  let rowTop = box.top;
  for (let r = 0; r * cols < cells.length; r++) {
    const row = cells.slice(r * cols, r * cols + cols);
    row.forEach((cell, c) => {
      const x = PAD_X + c * (colW + colGap);
      boxes.push({ ref: cell.item.cover, x, top: rowTop, width: colW, height: photoH });
      let y = rowTop + photoH + gap;
      lines(pdfPage, cell.nameLines, x, y, name, nameLh);
      if (cell.priceText) {
        // Baseline-aligned with the first line of the name.
        const priceTop = y + baseline(name, nameLh) - ascent(price);
        text(pdfPage, cell.priceText, x + colW - measure(cell.priceText, price), priceTop, price);
      }
      y += cell.nameLines.length * nameLh;
      if (cell.flow?.height) drawColours(pdfPage, cell.flow, x, y + gap, col, dots.dotSize, dots.dotGap, dots.rowGap);
    });
    rowTop += Math.max(...row.map((cell) => cell.height)) + rowGap;
  }
  await drawImages(pdfPage, ctx, boxes);
}

async function drawFeaturePage(ctx: Context, page: Extract<CataloguePage, { kind: "feature" }>) {
  const { doc, fonts, catalogue } = ctx;
  const { item } = page;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = drawFrame(ctx, pdfPage, page.number);

  const colGap = 30 * PX;
  const leftW = ((CONTENT_W - colGap) * 1.4) / 2.4;
  const rightW = CONTENT_W - colGap - leftW;
  const rightX = PAD_X + leftW + colGap;
  const height = box.bottom - box.top;
  const stackGap = 18 * PX;

  const name: TextStyle = { font: fonts.serif, size: 46 * PX, color: INK.ink, spacing: -46 * PX * 0.01 };
  const type: TextStyle = { font: fonts.sans, size: 14 * PX, color: INK.subtle };
  const price: TextStyle = { font: fonts.serif, size: 32 * PX, color: INK.ink };
  const col: TextStyle = { font: fonts.sans, size: 14 * PX, color: INK.muted };
  const dots = { dotSize: 13 * PX, dotGap: 6 * PX, colGap: 12 * PX, rowGap: 5 * PX };

  // The right column is bottom-aligned: measure each block, then stack upwards.
  const thumbGap = 10 * PX;
  const thumbW = (rightW - thumbGap) / 2;
  const thumbH = item.thumbs.length ? thumbW * 1.25 : 0;
  const nameLines = wrap(item.name, name, rightW, 3);
  const nameLh = name.size;
  const typeLh = type.size * 1.3;
  const showPrice = catalogue.showPrices && !!item.price;
  const priceLh = price.size * 1.1;
  const flow = catalogue.showColours ? flowColours(item.colours, col, rightW, 4, dots) : null;
  const blocks = [
    thumbH,
    nameLines.length * nameLh + 6 * PX + typeLh,
    showPrice ? priceLh : 0,
    flow?.height ?? 0,
  ].filter((h) => h > 0);
  const total = blocks.reduce((a, b) => a + b, 0) + stackGap * (blocks.length - 1);
  let y = Math.max(box.top, box.bottom - total);

  const boxes: (PhotoBox & { x: number; top: number })[] = [
    { ref: item.cover, x: PAD_X, top: box.top, width: leftW, height },
  ];
  if (thumbH) {
    item.thumbs.forEach((ref, i) => boxes.push({ ref, x: rightX + i * (thumbW + thumbGap), top: y, width: thumbW, height: thumbH }));
    y += thumbH + stackGap;
  }
  y += lines(pdfPage, nameLines, rightX, y, name, nameLh) + 6 * PX;
  text(pdfPage, wrap(item.type, type, rightW, 1)[0] ?? "", rightX, y, type);
  y += typeLh + stackGap;
  if (showPrice) {
    text(pdfPage, item.price, rightX, y, price);
    y += priceLh + stackGap;
  }
  if (flow?.height) drawColours(pdfPage, flow, rightX, y, col, dots.dotSize, dots.dotGap, dots.rowGap);

  await drawImages(pdfPage, ctx, boxes);
}

export type CataloguePdfInput = {
  catalogue: Catalogue;
  items: CatalogueItem[];
  storeName: string;
  /** Called after each page is drawn. */
  onProgress?: (done: number, total: number) => void;
};

export async function buildCataloguePdf({ catalogue, items, storeName, onProgress }: CataloguePdfInput) {
  if (!items.length) throw new Error("Add at least one product to the catalogue first.");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const fonts = Object.fromEntries(
    await Promise.all(
      (Object.keys(bytes) as FontName[]).map(async (name) => [name, await doc.embedFont(bytes[name], { subset: true })] as const),
    ),
  ) as Fonts;

  const title = catalogue.title || catalogue.name || "Catalogue";
  doc.setTitle(`${title} · ${storeName}`);
  doc.setAuthor(storeName);
  doc.setSubject(catalogue.subtitle);
  doc.setCreator(`${storeName} stock room`);

  const ctx: Context = {
    doc,
    fonts,
    photo: createPhotoEmbedder(doc),
    storeName,
    catalogue,
    footer: catalogueFooter(catalogue, storeName),
  };
  const pages = cataloguePages(catalogue, items);
  const total = pages.length + (catalogue.cover ? 1 : 0);
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  try {
    if (catalogue.cover) {
      await drawCover(ctx, items);
      tick();
    }
    for (const page of pages) {
      if (page.kind === "grid") await drawGridPage(ctx, page);
      else await drawFeaturePage(ctx, page);
      tick();
    }
    return await doc.save();
  } finally {
    releasePhotos();
  }
}
