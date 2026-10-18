import type { PDFPage } from "pdf-lib";

import { coverPhoto, type PhotoRef } from "./model";
import {
  ascent,
  baseline,
  clean,
  dot,
  dotRow,
  drawColours,
  drawImages,
  fit,
  flowColours,
  lines,
  measure,
  PAGE_H,
  PAGE_W,
  piecesLabel,
  PX,
  rect,
  roundRect,
  rule,
  text,
  textCentred,
  textRight,
  wrap,
  type Context,
  type FeaturePage,
  type GridPage,
  type PdfDesign,
  type PlacedPhoto,
  type TextStyle,
} from "./pdf-draw";

/** The Atelier, Lookbook and Boutique PDF designs. Sizes are design px (× PX). */

const px = (n: number) => n * PX;
const title = (ctx: Context) => ctx.catalogue.title || ctx.catalogue.name;
const pageNo = (n: number) => String(n).padStart(2, "0");
/** Transparent (background-removed) photos get `fill` behind them. */
const onFill = (ref: PhotoRef, fill: string): PhotoRef => ({ ...ref, backdrop: ref.backdrop ?? fill });

// ═════════════ Atelier: white, spacious, small capitals ═════════════

const A = { paper: "#ffffff", ink: "#111111", muted: "#6f6f6f", subtle: "#a3a3a3", line: "#e8e8e8" };
const A_X = px(56);
const A_W = PAGE_W - A_X * 2;

async function atelierCover(ctx: Context) {
  const { doc, fonts, catalogue, storeName, items } = ctx;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  rect(page, 0, 0, PAGE_W, PAGE_H, A.paper);
  const pad = px(64);
  const width = PAGE_W - pad * 2;
  const cx = PAGE_W / 2;

  const store: TextStyle = { font: fonts.sansMedium, size: px(11), color: A.ink, spacing: px(11) * 0.28 };
  textCentred(page, fit(clean(storeName).toUpperCase(), store, width), cx, pad, store);

  const foot: TextStyle = { font: fonts.mono, size: px(10), color: A.subtle, spacing: px(10) * 0.12 };
  const footTop = PAGE_H - pad - foot.size * 1.2;
  text(page, piecesLabel(items.length).toUpperCase(), pad, footTop, foot);
  textRight(page, "CATALOGUE", PAGE_W - pad, footTop, foot);
  const ruleTop = footTop - px(18);
  rule(page, pad, PAGE_W - pad, ruleTop, A.line);

  const titleStyle: TextStyle = { font: fonts.sansMedium, size: px(40), color: A.ink, spacing: px(40) * 0.04 };
  const subStyle: TextStyle = { font: fonts.sans, size: px(14), color: A.muted };
  const titleLines = wrap(title(ctx).toUpperCase(), titleStyle, width, 2);
  const subLines = catalogue.subtitle.trim() ? wrap(catalogue.subtitle, subStyle, px(520), 2) : [];
  const titleLh = titleStyle.size * 1.15;
  const subLh = subStyle.size * 1.5;
  const blockH = titleLines.length * titleLh + (subLines.length ? px(14) + subLines.length * subLh : 0);
  const blockTop = ruleTop - px(48) - blockH;
  lines(page, titleLines, cx, blockTop, titleStyle, titleLh, "centre");
  if (subLines.length) lines(page, subLines, cx, blockTop + titleLines.length * titleLh + px(14), subStyle, subLh, "centre");

  const photoTop = pad + store.size * 1.2 + px(36);
  const photoH = blockTop - px(48) - photoTop;
  if (photoH > 40) await drawImages(page, ctx, [{ ref: coverPhoto(items), x: pad, top: photoTop, width, height: photoH }]);
}

function atelierFrame(ctx: Context, page: PDFPage, number: number) {
  const { fonts, storeName } = ctx;
  rect(page, 0, 0, PAGE_W, PAGE_H, A.paper);
  const top = px(44);
  const store: TextStyle = { font: fonts.sansMedium, size: px(10), color: A.ink, spacing: px(10) * 0.28 };
  const label: TextStyle = { font: fonts.mono, size: px(9), color: A.subtle, spacing: px(9) * 0.1 };
  textCentred(page, fit(clean(storeName).toUpperCase(), store, A_W * 0.4), PAGE_W / 2, top, store);
  // Baseline-aligned with the store name.
  const labelTop = top + ascent(store) - ascent(label);
  text(page, fit(title(ctx).toUpperCase(), label, A_W * 0.28), A_X, labelTop, label);
  textRight(page, pageNo(number), PAGE_W - A_X, labelTop, label);

  const footTop = PAGE_H - px(40) - label.size * 1.2;
  textCentred(page, fit(ctx.footer.toUpperCase(), label, A_W * 0.7), PAGE_W / 2, footTop, label);
  return { top: top + store.size * 1.2 + px(40), bottom: footTop - px(32) };
}

async function atelierGrid(ctx: Context, page: GridPage) {
  const { doc, fonts, catalogue } = ctx;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = atelierFrame(ctx, pdfPage, page.number);

  const cols = 2;
  const colGap = px(24);
  const rowGap = px(22);
  const colW = (A_W - colGap * (cols - 1)) / cols;
  const num: TextStyle = { font: fonts.mono, size: px(9), color: A.subtle, spacing: px(9) * 0.1 };
  const name: TextStyle = { font: fonts.sansMedium, size: px(11), color: A.ink, spacing: px(11) * 0.08 };
  const price: TextStyle = { font: fonts.sans, size: px(11), color: A.muted };
  const more: TextStyle = { font: fonts.mono, size: px(9), color: A.subtle };
  const numLh = num.size * 1.4;
  const nameLh = name.size * 1.4;
  const priceLh = price.size * 1.4;
  const dots = { size: px(7), gap: px(5), style: more };
  const rowCount = Math.ceil(page.items.length / cols);
  const captionH =
    px(12) + numLh + px(4) + 2 * nameLh +
    (catalogue.showPrices ? priceLh : 0) +
    (catalogue.showColours ? px(8) + px(11) : 0);
  const available = box.bottom - box.top;
  const photoH = Math.min(
    colW * (rowCount === 1 ? 1.6 : 1.25),
    (available - rowGap * (rowCount - 1)) / rowCount - captionH,
  );

  const cells = page.items.map((item) => {
    const nameLines = wrap(item.name.toUpperCase(), name, colW, 2);
    const showPrice = catalogue.showPrices && !!item.price;
    const showDots = catalogue.showColours && item.colours.length > 0;
    const height =
      photoH + px(12) + numLh + px(4) + nameLines.length * nameLh + (showPrice ? priceLh : 0) + (showDots ? px(8) + px(11) : 0);
    return { item, nameLines, showPrice, showDots, height };
  });

  const boxes: PlacedPhoto[] = [];
  const rows = Array.from({ length: rowCount }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
  const gridH = rows.reduce((h, row) => h + Math.max(...row.map((cell) => cell.height)), rowGap * (rowCount - 1));
  let rowTop = box.top + Math.max(0, (available - gridH) / 2);
  for (const row of rows) {
    row.forEach((cell, c) => {
      const x = A_X + c * (colW + colGap);
      boxes.push({ ref: cell.item.cover, x, top: rowTop, width: colW, height: photoH });
      let y = rowTop + photoH + px(12);
      text(pdfPage, ctx.numberOf(cell.item), x, y, num, numLh);
      y += numLh + px(4);
      y += lines(pdfPage, cell.nameLines, x, y, name, nameLh);
      if (cell.showPrice) {
        text(pdfPage, cell.item.price, x, y, price, priceLh);
        y += priceLh;
      }
      if (cell.showDots) dotRow(pdfPage, cell.item.colours, x, y + px(8), colW, dots);
    });
    rowTop += Math.max(...row.map((cell) => cell.height)) + rowGap;
  }
  await drawImages(pdfPage, ctx, boxes);
}

async function atelierFeature(ctx: Context, page: FeaturePage) {
  const { doc, fonts, catalogue } = ctx;
  const { item } = page;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = atelierFrame(ctx, pdfPage, page.number);

  // Photos across the top: the main one, with up to two more stacked beside it.
  const gap = px(12);
  const photoH = (box.bottom - box.top) * 0.7;
  const mainW = item.thumbs.length ? ((A_W - gap) * 2) / 3 : A_W;
  const boxes: PlacedPhoto[] = [{ ref: item.cover, x: A_X, top: box.top, width: mainW, height: photoH }];
  const thumbH = (photoH - gap) / 2;
  item.thumbs.forEach((ref, i) =>
    boxes.push({ ref, x: A_X + mainW + gap, top: box.top + i * (thumbH + gap), width: A_W - mainW - gap, height: thumbH }),
  );

  const top = box.top + photoH + px(28);
  const leftW = A_W * 0.56;
  const rightX = A_X + A_W * 0.62;
  const rightW = A_W - (rightX - A_X);

  const num: TextStyle = { font: fonts.mono, size: px(10), color: A.subtle, spacing: px(10) * 0.1 };
  const name: TextStyle = { font: fonts.sansMedium, size: px(24), color: A.ink, spacing: px(24) * 0.04 };
  const type: TextStyle = { font: fonts.sans, size: px(12), color: A.muted };
  let y = top;
  text(pdfPage, `NO. ${ctx.numberOf(item)}`, A_X, y, num);
  y += num.size * 1.2 + px(12);
  y += lines(pdfPage, wrap(item.name.toUpperCase(), name, leftW, 3), A_X, y, name, name.size * 1.2) + px(8);
  text(pdfPage, fit(item.type, type, leftW), A_X, y, type);

  y = top;
  if (catalogue.showPrices && item.price) {
    const price: TextStyle = { font: fonts.sansMedium, size: px(18), color: A.ink };
    text(pdfPage, item.price, rightX, y, price);
    y += price.size * 1.2 + px(16);
  }
  if (catalogue.showColours) {
    const col: TextStyle = { font: fonts.sans, size: px(11), color: A.muted };
    const dots = { dotSize: px(9), dotGap: px(6), colGap: px(14), rowGap: px(6) };
    drawColours(pdfPage, flowColours(item.colours, col, rightW, 5, dots), rightX, y, col, dots);
  }
  await drawImages(pdfPage, ctx, boxes);
}

export const atelier: PdfDesign = { cover: atelierCover, grid: atelierGrid, feature: atelierFeature };

// ═════════════ Lookbook: full-bleed photos, big serif ═════════════

const L = { paper: "#f4f1eb", ink: "#151412", muted: "#5f5a52", subtle: "#8f897f", light: "#f4f1eb", lightSub: "#e4ddd1" };
const L_X = px(40);
const L_W = PAGE_W - L_X * 2;

async function lookbookCover(ctx: Context) {
  const { doc, fonts, catalogue, storeName, items } = ctx;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  rect(page, 0, 0, PAGE_W, PAGE_H, L.ink);
  // The photo goes down first, shaded top and bottom so the type over it reads.
  const shade: [number, string][] = [
    [0, "rgba(21,20,18,.5)"],
    [0.22, "rgba(21,20,18,0)"],
    [0.4, "rgba(21,20,18,0)"],
    [1, "rgba(21,20,18,.82)"],
  ];
  await drawImages(page, ctx, [
    { ref: onFill(coverPhoto(items), L.ink), x: 0, top: 0, width: PAGE_W, height: PAGE_H, shade },
  ]);

  const pad = px(48);
  const width = PAGE_W - pad * 2;
  const store: TextStyle = { font: fonts.serifItalic, size: px(28), color: L.light };
  const count: TextStyle = { font: fonts.mono, size: px(10), color: L.light, spacing: px(10) * 0.12 };
  text(page, fit(storeName, store, width * 0.65), pad, pad, store);
  textRight(page, piecesLabel(items.length).toUpperCase(), PAGE_W - pad, pad + ascent(store) - ascent(count), count);

  const titleStyle: TextStyle = { font: fonts.serif, size: px(112), color: L.light, spacing: -px(112) * 0.025 };
  const subStyle: TextStyle = { font: fonts.sans, size: px(16), color: L.lightSub };
  const titleLines = wrap(title(ctx), titleStyle, width, 3);
  const subLines = catalogue.subtitle.trim() ? wrap(catalogue.subtitle, subStyle, px(480), 2) : [];
  const titleLh = titleStyle.size * 0.9;
  const subLh = subStyle.size * 1.45;
  const blockH = titleLines.length * titleLh + (subLines.length ? px(18) + subLines.length * subLh : 0);
  const blockTop = PAGE_H - pad - blockH;
  lines(page, titleLines, pad, blockTop, titleStyle, titleLh);
  if (subLines.length) lines(page, subLines, pad, blockTop + titleLines.length * titleLh + px(18), subStyle, subLh);
}

/** The small running header and footer lines; returns their tops. */
function lookbookRunning(ctx: Context, page: PDFPage, number: number) {
  const label: TextStyle = { font: ctx.fonts.mono, size: px(9), color: L.subtle, spacing: px(9) * 0.12 };
  const footTop = PAGE_H - px(32) - label.size * 1.2;
  text(page, fit(`${clean(ctx.storeName)} — ${title(ctx)}`.toUpperCase(), label, L_W * 0.7), L_X, footTop, label);
  textRight(page, `P. ${pageNo(number)}`, PAGE_W - L_X, footTop, label);
  return { label, footTop };
}

async function lookbookGrid(ctx: Context, page: GridPage) {
  const { doc, fonts, catalogue } = ctx;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  rect(pdfPage, 0, 0, PAGE_W, PAGE_H, L.paper);
  const { footTop } = lookbookRunning(ctx, pdfPage, page.number);

  const cols = 2;
  const colGap = px(20);
  const rowGap = px(30);
  const colW = (L_W - colGap) / cols;
  const indent = px(36);
  const num: TextStyle = { font: fonts.serifItalic, size: px(20), color: L.subtle };
  const name: TextStyle = { font: fonts.serif, size: px(26), color: L.ink };
  const price: TextStyle = { font: fonts.sansMedium, size: px(13), color: L.ink };
  const col: TextStyle = { font: fonts.sans, size: px(11), color: L.muted };
  const nameLh = name.size * 1.05;
  const colLh = col.size * 1.4;

  // Photos are sized for the tallest possible captions, so every page lines up.
  const captionH = px(12) + 2 * nameLh + (catalogue.showColours ? px(4) + colLh : 0);
  const top = px(40);
  const photoH = Math.min(colW * 1.3, (footTop - px(28) - top - rowGap) / 2 - captionH);

  const boxes: PlacedPhoto[] = [];
  page.items.forEach((item, i) => {
    const x = L_X + (i % cols) * (colW + colGap);
    const rowTop = top + Math.floor(i / cols) * (photoH + captionH + rowGap);
    boxes.push({ ref: item.cover, x, top: rowTop, width: colW, height: photoH });

    const y = rowTop + photoH + px(12);
    const priceText = catalogue.showPrices ? item.price : "";
    const priceW = priceText ? measure(priceText, price) + px(12) : 0;
    const nameLines = wrap(item.name, name, colW - indent - priceW, 2);
    // Number and price share the first line's baseline.
    const base = y + baseline(name, nameLh);
    text(pdfPage, ctx.numberOf(item), x, base - ascent(num), num);
    const nameH = lines(pdfPage, nameLines, x + indent, y, name, nameLh);
    if (priceText) textRight(pdfPage, priceText, x + colW, base - ascent(price), price);
    if (catalogue.showColours && item.colours.length) {
      const names = item.colours.map((c) => c.name).join(" · ");
      text(pdfPage, fit(names, col, colW - indent), x + indent, y + nameH + px(4), col, colLh);
    }
  });
  await drawImages(pdfPage, ctx, boxes);
}

async function lookbookFeature(ctx: Context, page: FeaturePage) {
  const { doc, fonts, catalogue } = ctx;
  const { item } = page;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  rect(pdfPage, 0, 0, PAGE_W, PAGE_H, L.paper);
  lookbookRunning(ctx, pdfPage, page.number);

  const photoH = PAGE_H * 0.62;
  const boxes: PlacedPhoto[] = [{ ref: item.cover, x: 0, top: 0, width: PAGE_W, height: photoH }];
  const top = photoH + px(36);

  const thumbGap = px(10);
  const thumbW = px(124);
  const thumbH = thumbW * 1.25;
  const thumbsLeft = PAGE_W - L_X - item.thumbs.length * (thumbW + thumbGap) + thumbGap;
  item.thumbs.forEach((ref, i) =>
    boxes.push({ ref, x: thumbsLeft + i * (thumbW + thumbGap), top, width: thumbW, height: thumbH }),
  );

  const num: TextStyle = { font: fonts.serifItalic, size: px(72), color: L.subtle };
  text(pdfPage, ctx.numberOf(item), L_X, top, num, num.size);

  const x = L_X + px(112);
  const width = (item.thumbs.length ? thumbsLeft - px(28) : PAGE_W - L_X) - x;
  const name: TextStyle = { font: fonts.serif, size: px(44), color: L.ink, spacing: -px(44) * 0.01 };
  const type: TextStyle = { font: fonts.sans, size: px(13), color: L.muted };
  let y = top + px(6);
  y += lines(pdfPage, wrap(item.name, name, width, 2), x, y, name, name.size) + px(6);
  text(pdfPage, fit(item.type, type, width), x, y, type, type.size * 1.4);
  y += type.size * 1.4 + px(18);
  if (catalogue.showPrices && item.price) {
    const price: TextStyle = { font: fonts.serif, size: px(28), color: L.ink };
    text(pdfPage, item.price, x, y, price, price.size * 1.1);
    y += price.size * 1.1 + px(14);
  }
  if (catalogue.showColours) {
    const col: TextStyle = { font: fonts.sans, size: px(12), color: L.muted };
    const dots = { dotSize: px(10), dotGap: px(6), colGap: px(14), rowGap: px(5) };
    drawColours(pdfPage, flowColours(item.colours, col, width, 3, dots), x, y, col, dots);
  }
  await drawImages(pdfPage, ctx, boxes);
}

export const lookbook: PdfDesign = { cover: lookbookCover, grid: lookbookGrid, feature: lookbookFeature };

// ═════════════ Boutique: blush, terracotta, arches ═════════════

const B = {
  paper: "#f6ebe3",
  card: "#fcf6f1",
  ink: "#3b2320",
  muted: "#86655b",
  subtle: "#a88a80",
  accent: "#b4553d",
  onAccent: "#fbf1e8",
  onAccentSub: "#f2d6c8",
};
const B_X = px(48);
const B_W = PAGE_W - B_X * 2;

async function boutiqueCover(ctx: Context) {
  const { doc, fonts, catalogue, storeName, items } = ctx;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  rect(page, 0, 0, PAGE_W, PAGE_H, B.accent);
  const pad = px(56);
  const width = PAGE_W - pad * 2;
  const cx = PAGE_W / 2;

  const store: TextStyle = { font: fonts.sansMedium, size: px(11), color: B.onAccent, spacing: px(11) * 0.3 };
  textCentred(page, fit(clean(storeName).toUpperCase(), store, width), cx, pad, store);
  const count: TextStyle = { font: fonts.mono, size: px(10), color: B.onAccentSub, spacing: px(10) * 0.14 };
  const countTop = PAGE_H - pad - count.size * 1.2;
  textCentred(page, piecesLabel(items.length).toUpperCase(), cx, countTop, count);

  const titleStyle: TextStyle = { font: fonts.serifItalic, size: px(76), color: B.onAccent, spacing: -px(76) * 0.01 };
  const subStyle: TextStyle = { font: fonts.sans, size: px(15), color: B.onAccentSub };
  const titleLines = wrap(title(ctx), titleStyle, width, 2);
  const subLines = catalogue.subtitle.trim() ? wrap(catalogue.subtitle, subStyle, px(520), 2) : [];
  const titleLh = titleStyle.size * 0.95;
  const subLh = subStyle.size * 1.45;
  const blockH = titleLines.length * titleLh + (subLines.length ? px(14) + subLines.length * subLh : 0);
  const blockTop = countTop - px(40) - blockH;
  lines(page, titleLines, cx, blockTop, titleStyle, titleLh, "centre");
  if (subLines.length) lines(page, subLines, cx, blockTop + titleLines.length * titleLh + px(14), subStyle, subLh, "centre");

  const photoTop = pad + px(48);
  const photoH = blockTop - px(40) - photoTop;
  const photoW = Math.min(px(460), photoH * 0.78);
  if (photoH > 40) {
    const ref = onFill(coverPhoto(items), B.card);
    await drawImages(page, ctx, [
      { ref, x: cx - photoW / 2, top: photoTop, width: photoW, height: photoH, shape: { kind: "arch", matte: B.accent } },
    ]);
  }
}

function boutiqueFrame(ctx: Context, page: PDFPage, number: number) {
  rect(page, 0, 0, PAGE_W, PAGE_H, B.paper);
  const cx = PAGE_W / 2;
  const top = px(40);
  const store: TextStyle = { font: ctx.fonts.serifItalic, size: px(26), color: B.ink };
  textCentred(page, fit(ctx.storeName, store, B_W * 0.7), cx, top, store);
  const ruleTop = top + store.size * 1.15 + px(10);
  rule(page, cx - px(16), cx + px(16), ruleTop, B.accent, 1.2);

  const foot: TextStyle = { font: ctx.fonts.mono, size: px(9), color: B.subtle, spacing: px(9) * 0.12 };
  const footTop = PAGE_H - px(36) - foot.size * 1.2;
  textCentred(page, fit(`${ctx.footer} · Page ${number}`.toUpperCase(), foot, B_W), cx, footTop, foot);
  return { top: ruleTop + px(28), bottom: footTop - px(28) };
}

async function boutiqueGrid(ctx: Context, page: GridPage) {
  const { doc, fonts, catalogue } = ctx;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = boutiqueFrame(ctx, pdfPage, page.number);

  const cols = 2;
  const colGap = px(16);
  const rowGap = px(18);
  const pad = px(12);
  const colW = (B_W - colGap * (cols - 1)) / cols;
  const photoW = colW - pad * 2;
  const name: TextStyle = { font: fonts.serif, size: px(19), color: B.ink };
  const price: TextStyle = { font: fonts.sansMedium, size: px(12), color: B.accent, spacing: px(12) * 0.04 };
  const more: TextStyle = { font: fonts.mono, size: px(9), color: B.subtle };
  const nameLh = name.size * 1.15;
  const priceLh = price.size * 1.4;
  const dots = { size: px(8), gap: px(5), style: more, align: "centre" as const };
  const rowCount = Math.ceil(page.items.length / cols);
  const captionH =
    pad + px(12) + 2 * nameLh +
    (catalogue.showPrices ? px(4) + priceLh : 0) +
    (catalogue.showColours ? px(8) + px(11) : 0) +
    pad + px(4);
  const available = box.bottom - box.top;
  const photoH = Math.min(
    photoW * (rowCount === 1 ? 1.6 : 1.25),
    (available - rowGap * (rowCount - 1)) / rowCount - captionH,
  );

  const cells = page.items.map((item) => {
    const nameLines = wrap(item.name, name, photoW, 2);
    const showPrice = catalogue.showPrices && !!item.price;
    const showDots = catalogue.showColours && item.colours.length > 0;
    const height =
      pad + photoH + px(12) + nameLines.length * nameLh + (showPrice ? px(4) + priceLh : 0) + (showDots ? px(8) + px(11) : 0) + pad + px(4);
    return { item, nameLines, showPrice, showDots, height };
  });

  const boxes: PlacedPhoto[] = [];
  const rows = Array.from({ length: rowCount }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
  const gridH = rows.reduce((h, row) => h + Math.max(...row.map((cell) => cell.height)), rowGap * (rowCount - 1));
  let rowTop = box.top + Math.max(0, (available - gridH) / 2);
  for (const row of rows) {
    const rowH = Math.max(...row.map((cell) => cell.height));
    row.forEach((cell, c) => {
      const x = B_X + c * (colW + colGap);
      const cx = x + colW / 2;
      roundRect(pdfPage, x, rowTop, colW, rowH, px(14), B.card);
      boxes.push({
        ref: cell.item.cover,
        x: x + pad,
        top: rowTop + pad,
        width: photoW,
        height: photoH,
        shape: { kind: "arch", matte: B.card },
      });
      let y = rowTop + pad + photoH + px(12);
      y += lines(pdfPage, cell.nameLines, cx, y, name, nameLh, "centre");
      if (cell.showPrice) {
        textCentred(pdfPage, cell.item.price, cx, y + px(4), price, priceLh);
        y += px(4) + priceLh;
      }
      if (cell.showDots) dotRow(pdfPage, cell.item.colours, cx, y + px(8), photoW, dots);
    });
    rowTop += rowH + rowGap;
  }
  await drawImages(pdfPage, ctx, boxes);
}

async function boutiqueFeature(ctx: Context, page: FeaturePage) {
  const { doc, fonts, catalogue } = ctx;
  const { item } = page;
  const pdfPage = doc.addPage([PAGE_W, PAGE_H]);
  const box = boutiqueFrame(ctx, pdfPage, page.number);
  const available = box.bottom - box.top;

  const leftW = B_W * 0.54;
  const photoH = Math.min(available, leftW * 1.42);
  const boxes: PlacedPhoto[] = [
    {
      ref: item.cover,
      x: B_X,
      top: box.top + (available - photoH) / 2,
      width: leftW,
      height: photoH,
      shape: { kind: "arch", matte: B.paper },
    },
  ];

  // The right column is centred both ways: measure each block, then draw.
  const x = B_X + leftW + px(36);
  const width = PAGE_W - B_X - x;
  const cx = x + width / 2;
  const gap = px(18);
  const thumbGap = px(10);
  const thumbW = Math.min(px(84), (width - thumbGap) / 2);
  const thumbH = item.thumbs.length ? thumbW * 1.2 : 0;
  const name: TextStyle = { font: fonts.serifItalic, size: px(42), color: B.ink };
  const type: TextStyle = { font: fonts.sans, size: px(11), color: B.muted, spacing: px(11) * 0.16 };
  const price: TextStyle = { font: fonts.sansMedium, size: px(14), color: B.onAccent };
  const col: TextStyle = { font: fonts.sans, size: px(12), color: B.muted };
  const nameLines = wrap(item.name, name, width, 3);
  const showPrice = catalogue.showPrices && !!item.price;
  const pillH = px(32);
  const colourLh = px(20);
  const maxColours = 6;
  const colours = catalogue.showColours ? item.colours : [];
  const listed = colours.length > maxColours ? colours.slice(0, maxColours - 1) : colours;
  const extra = colours.length - listed.length;
  const listRows = listed.length + (extra ? 1 : 0);

  const blocks = [
    thumbH,
    nameLines.length * name.size + px(10) + type.size * 1.3,
    showPrice ? pillH : 0,
    listRows * colourLh,
  ].filter((h) => h > 0);
  const total = blocks.reduce((a, b) => a + b, 0) + gap * (blocks.length - 1);
  let y = box.top + Math.max(0, (available - total) / 2);

  if (thumbH) {
    const rowW = item.thumbs.length * (thumbW + thumbGap) - thumbGap;
    item.thumbs.forEach((ref, i) =>
      boxes.push({
        ref,
        x: cx - rowW / 2 + i * (thumbW + thumbGap),
        top: y,
        width: thumbW,
        height: thumbH,
        shape: { kind: "rounded", radius: px(10), matte: B.paper },
      }),
    );
    y += thumbH + gap;
  }
  y += lines(pdfPage, nameLines, cx, y, name, name.size, "centre") + px(10);
  textCentred(pdfPage, fit(item.type.toUpperCase(), type, width), cx, y, type, type.size * 1.3);
  y += type.size * 1.3 + gap;
  if (showPrice) {
    const pillW = measure(item.price, price) + px(36);
    roundRect(pdfPage, cx - pillW / 2, y, pillW, pillH, pillH / 2, B.accent);
    textCentred(pdfPage, item.price, cx, y, price, pillH);
    y += pillH + gap;
  }
  const dotSize = px(10);
  for (const c of listed) {
    const label = fit(c.name, col, width - dotSize - px(8));
    const left = cx - (dotSize + px(8) + measure(label, col)) / 2;
    dot(pdfPage, left, y + (colourLh - dotSize) / 2, dotSize, c.hex);
    text(pdfPage, label, left + dotSize + px(8), y, col, colourLh);
    y += colourLh;
  }
  if (extra) textCentred(pdfPage, `+${extra} more`, cx, y, col, colourLh);

  await drawImages(pdfPage, ctx, boxes);
}

export const boutique: PdfDesign = { cover: boutiqueCover, grid: boutiqueGrid, feature: boutiqueFeature };
