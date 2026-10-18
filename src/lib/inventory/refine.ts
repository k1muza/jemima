/**
 * Manual refinement of a background-removed photo, done non-destructively:
 * the Cloudinary cutout is an immutable base layer, and edits live in a mask
 * holding how much of each pixel is erased (0 = kept, 255 = erased). The
 * refined image is base alpha × (1 − mask), so the restore brush can only
 * bring back pixels that exist in the base. Pure pixel maths on typed arrays
 * (no DOM), so it runs and is tested outside the browser.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type BrushMode = "erase" | "restore";

/** Refuse to edit images larger than this (keeps memory sane on phones). */
export const MAX_EDIT_PIXELS = 12_000_000;
/** Undo history budget, in bytes of stored mask regions. */
const HISTORY_BYTES = 24 * 1024 * 1024;

type HistoryEntry = { rect: Rect; before: Uint8Array; after: Uint8Array };

function copyRect(mask: Uint8Array, width: number, { x, y, w, h }: Rect) {
  const out = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) out.set(mask.subarray((y + row) * width + x, (y + row) * width + x + w), row * w);
  return out;
}

function pasteRect(mask: Uint8Array, width: number, { x, y, w, h }: Rect, data: Uint8Array) {
  for (let row = 0; row < h; row++) mask.set(data.subarray(row * w, row * w + w), (y + row) * width + x);
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Write refined pixels (base with the mask applied) into `out`, for `rect` or
 * the whole image. `base` and `out` are RGBA; `mask` is one byte per pixel.
 */
export function composite(base: Uint8ClampedArray, mask: Uint8Array, out: Uint8ClampedArray, width: number, rect?: Rect) {
  const { x, y, w, h } = rect ?? { x: 0, y: 0, w: width, h: mask.length / width };
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const p = row * width + col;
      const i = p * 4;
      out[i] = base[i];
      out[i + 1] = base[i + 1];
      out[i + 2] = base[i + 2];
      out[i + 3] = Math.round((base[i + 3] * (255 - mask[p])) / 255);
    }
  }
}

/** The mask as RGBA for saving as a PNG: black, with alpha = how erased. */
export function maskToRgba(mask: Uint8Array) {
  const rgba = new Uint8ClampedArray(mask.length * 4);
  for (let p = 0; p < mask.length; p++) rgba[p * 4 + 3] = mask[p];
  return rgba;
}

/** Read a saved mask back from its RGBA pixels (the alpha channel). */
export function maskFromRgba(rgba: Uint8ClampedArray) {
  const mask = new Uint8Array(rgba.length / 4);
  for (let p = 0; p < mask.length; p++) mask[p] = rgba[p * 4 + 3];
  return mask;
}

export function isMaskEmpty(mask: Uint8Array) {
  return mask.every((v) => v === 0);
}

/**
 * Brush strokes, undo/redo and reset over a mask. `onChange(rect)` reports
 * each region whose mask changed, so the view can redraw only that part.
 */
export function createMaskEditor(width: number, height: number, initial?: Uint8Array, onChange?: (rect: Rect) => void) {
  if (initial && initial.length !== width * height) throw new Error("The saved mask doesn't match this photo's size.");
  const mask = initial ? initial.slice() : new Uint8Array(width * height);
  const entries: HistoryEntry[] = [];
  let cursor = 0; // entries[0..cursor) are applied
  let historyBytes = 0;

  let stroke: { mode: BrushMode; radius: number; last: { x: number; y: number } | null; rect: Rect | null; before: Uint8Array } | null =
    null;

  const push = (entry: HistoryEntry) => {
    for (const dropped of entries.splice(cursor)) historyBytes -= dropped.before.length * 2;
    entries.push(entry);
    historyBytes += entry.before.length * 2;
    while (historyBytes > HISTORY_BYTES && entries.length > 1) historyBytes -= entries.shift()!.before.length * 2;
    cursor = entries.length;
  };

  /** One round brush dab; anti-aliased over its last pixel. */
  const dab = (cx: number, cy: number) => {
    const { mode, radius } = stroke!;
    const x0 = Math.max(0, Math.floor(cx - radius - 1));
    const y0 = Math.max(0, Math.floor(cy - radius - 1));
    const x1 = Math.min(width, Math.ceil(cx + radius + 1));
    const y1 = Math.min(height, Math.ceil(cy + radius + 1));
    if (x1 <= x0 || y1 <= y0) return;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const coverage = Math.min(1, Math.max(0, radius - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5));
        if (!coverage) continue;
        const p = y * width + x;
        const value = Math.round(coverage * 255);
        mask[p] = mode === "erase" ? Math.max(mask[p], value) : Math.min(mask[p], 255 - value);
      }
    }
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    stroke!.rect = union(stroke!.rect, rect);
    onChange?.(rect);
  };

  return {
    width,
    height,
    mask,

    /** Start a stroke; `radius` is in image pixels. */
    begin(mode: BrushMode, radius: number) {
      stroke = { mode, radius: Math.max(0.5, radius), last: null, rect: null, before: mask.slice() };
    },
    /** Extend the stroke to (x, y), filling the gap so fast moves leave no holes. */
    to(x: number, y: number) {
      if (!stroke) return;
      const last = stroke.last;
      if (last) {
        const distance = Math.hypot(x - last.x, y - last.y);
        const steps = Math.ceil(distance / Math.max(0.5, stroke.radius / 3));
        for (let i = 1; i <= steps; i++) dab(last.x + ((x - last.x) * i) / steps, last.y + ((y - last.y) * i) / steps);
      } else {
        dab(x, y);
      }
      stroke.last = { x, y };
    },
    /** Finish the stroke as one undo step (nothing is recorded if it changed nothing). */
    end() {
      if (!stroke) return;
      const { rect, before } = stroke;
      stroke = null;
      if (!rect) return;
      const prior = copyRect(before, width, rect);
      const after = copyRect(mask, width, rect);
      if (prior.every((v, i) => v === after[i])) return;
      push({ rect, before: prior, after });
    },
    /** Abandon the stroke in progress (e.g. a second finger starts a pinch). */
    cancel() {
      if (!stroke) return;
      const { rect, before } = stroke;
      stroke = null;
      if (!rect) return;
      pasteRect(mask, width, rect, copyRect(before, width, rect));
      onChange?.(rect);
    },
    get drawing() {
      return stroke !== null;
    },

    undo() {
      if (!cursor) return;
      const entry = entries[--cursor];
      pasteRect(mask, width, entry.rect, entry.before);
      onChange?.(entry.rect);
    },
    redo() {
      if (cursor === entries.length) return;
      const entry = entries[cursor++];
      pasteRect(mask, width, entry.rect, entry.after);
      onChange?.(entry.rect);
    },
    get canUndo() {
      return cursor > 0;
    },
    get canRedo() {
      return cursor < entries.length;
    },

    /** Clear every refinement, back to the plain background-removed image. Undoable. */
    reset() {
      if (isMaskEmpty(mask)) return;
      const rect = { x: 0, y: 0, w: width, h: height };
      const before = mask.slice();
      mask.fill(0);
      push({ rect, before, after: mask.slice() });
      onChange?.(rect);
    },

    /** True once the mask differs from how the session started (undoing back counts as unchanged). */
    get dirty() {
      if (!cursor) return false;
      const start = initial ?? new Uint8Array(width * height);
      for (let p = 0; p < mask.length; p++) if (mask[p] !== start[p]) return true;
      return false;
    },
  };
}

export type MaskEditor = ReturnType<typeof createMaskEditor>;
