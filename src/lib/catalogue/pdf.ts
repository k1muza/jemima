import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFPage } from "pdf-lib";

import type { Catalogue, CatalogueTheme } from "@/lib/inventory/types";

import { createServerPhotoRenderer } from "./server-images";
import { catalogueFooter, cataloguePages, coverPhoto, type CatalogueItem } from "./model";
import {
  ascent,
  baseline,
  clean,
  colour,
  createPhotoEmbedder,
  drawColours,
  drawImages,
  FONT_FILES,
  flowColours,
  lines,
  measure,
  PAGE_H,
  PAGE_W,
  piecesLabel,
  PX,
  rect,
  text,
  wrap,
  type Context,
  type FeaturePage,
  type FontName,
  type Fonts,
  type GridPage,
  type PdfDesign,
  type PlacedPhoto,
  type TextStyle,
} from "./pdf-draw";
import { atelier, boutique, lookbook } from "./pdf-themes";

/**
 * Builds the printable catalogue as an A4 PDF with pdf-lib, following the
 * design's print pages (794×1123 px, so every design px is 0.75 pt).
 * Node-side: fonts are loaded from disk and photos are prepared with Sharp.
 */

let fontBytes: Promise<Record<FontName, Uint8Array>> | null = null;

function loadFontBytes() {
  fontBytes ??= Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) => {
      const bytes = await readFile(path.join(process.cwd(), "public", "fonts", "catalogue", FONT_FILES[name]));
      return [name, bytes] as const;
    }),
  )
    .then((entries) => Object.fromEntries(entries) as Record<FontName, Uint8Array>)
    .catch((error) => {
      fontBytes = null; // retry next time
      throw error;
    });
  return fontBytes;
}

// ───────────── Classic ─────────────

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

const PAD_TOP = 52 * PX;
const PAD_X = 56 * PX;
const PAD_BOTTOM = 40 * PX;
const CONTENT_W = PAGE_W - PAD_X * 2;
const BLOCK_GAP = 30 * PX;

async function drawCover(ctx: Context) {
  const { doc, fonts, catalogue, storeName, items } = ctx;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const pad = 56 * PX;
  const width = PAGE_W - pad * 2;
  rect(page, 0, 0, PAGE_W, PAGE_H, INK.coverBg);

  const top: TextStyle = { font: fonts.mono, size: 12 * PX, color: INK.coverMuted, spacing: 12 * PX * 0.1 };
  const pieces = piecesLabel(items.length).toUpperCase();
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

async function drawGridPage(ctx: Context, page: GridPage) {
  const { doc, fonts, catalogue } = ctx;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = drawFrame(ctx, pdfPage, page.number);

  const cols = 2;
  const colGap = 22 * PX;
  const rowGap = 24 * PX;
  const gap = 10 * PX;
  const colW = (CONTENT_W - colGap * (cols - 1)) / cols;
  const name: TextStyle = { font: fonts.serif, size: 21 * PX, color: INK.ink };
  const nameLh = name.size * 1.1;
  const price: TextStyle = { font: fonts.sansMedium, size: 14 * PX, color: INK.ink };
  const col: TextStyle = { font: fonts.sans, size: 11 * PX, color: INK.muted };
  const dots = { dotSize: 9 * PX, dotGap: 6 * PX, colGap: 12 * PX, rowGap: 5 * PX };
  const rowCount = Math.ceil(page.items.length / cols);
  const colourH = catalogue.showColours ? gap + 2 * Math.max(dots.dotSize, col.size * 1.2) + dots.rowGap : 0;
  const captionH = gap + 2 * nameLh + colourH;
  // Reserve room for two name and colour lines so no caption can touch the footer.
  // A partial final page may use taller photos, with the row centred vertically.
  const available = box.bottom - box.top;
  const photoH = Math.min(
    colW * (rowCount === 1 ? 1.6 : 1.25),
    (available - rowGap * (rowCount - 1)) / rowCount - captionH,
  );

  const cells = page.items.map((item) => {
    const priceText = catalogue.showPrices ? item.price : "";
    const priceW = priceText ? measure(priceText, price) + gap : 0;
    const nameLines = wrap(item.name, name, colW - priceW, 2);
    const flow = catalogue.showColours ? flowColours(item.colours, col, colW, 2, dots) : null;
    const height = photoH + gap + nameLines.length * nameLh + (flow?.height ? gap + flow.height : 0);
    return { item, priceText, nameLines, flow, height };
  });

  const boxes: PlacedPhoto[] = [];
  const rows = Array.from({ length: rowCount }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
  const gridH = rows.reduce((h, row) => h + Math.max(...row.map((cell) => cell.height)), rowGap * (rowCount - 1));
  let rowTop = box.top + Math.max(0, (available - gridH) / 2);
  for (const row of rows) {
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
      if (cell.flow?.height) drawColours(pdfPage, cell.flow, x, y + gap, col, dots);
    });
    rowTop += Math.max(...row.map((cell) => cell.height)) + rowGap;
  }
  await drawImages(pdfPage, ctx, boxes);
}

async function drawFeaturePage(ctx: Context, page: FeaturePage) {
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

  const boxes: PlacedPhoto[] = [{ ref: item.cover, x: PAD_X, top: box.top, width: leftW, height }];
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
  if (flow?.height) drawColours(pdfPage, flow, rightX, y, col, dots);

  await drawImages(pdfPage, ctx, boxes);
}

const classic: PdfDesign = { cover: drawCover, grid: drawGridPage, feature: drawFeaturePage };

const DESIGNS: Record<CatalogueTheme, PdfDesign> = {
  Classic: classic,
  Atelier: atelier,
  Lookbook: lookbook,
  Boutique: boutique,
};

// ───────────── Build ─────────────

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
  // Shown as the tab title when the PDF opens in a browser tab.
  doc.setTitle(`${title} · ${storeName}`, { showInWindowTitleBar: true });
  doc.setAuthor(storeName);
  doc.setSubject(catalogue.subtitle);
  doc.setCreator(`${storeName} stock room`);

  const positions = new Map(items.map((item, i) => [item.id, i + 1]));
  const ctx: Context = {
    doc,
    fonts,
    photo: createPhotoEmbedder(doc, createServerPhotoRenderer()),
    storeName,
    catalogue,
    footer: catalogueFooter(catalogue, storeName),
    items,
    numberOf: (item) => String(positions.get(item.id) ?? 0).padStart(2, "0"),
  };
  const design = DESIGNS[catalogue.theme] ?? classic;
  const pages = cataloguePages(catalogue, items);
  const total = pages.length + (catalogue.cover ? 1 : 0);
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  if (catalogue.cover) {
    await design.cover(ctx);
    tick();
  }
  for (const page of pages) {
    if (page.kind === "grid") await design.grid(ctx, page);
    else await design.feature(ctx, page);
    tick();
  }
  return await doc.save();
}
