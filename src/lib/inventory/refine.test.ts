import { describe, expect, it, vi } from "vitest";

import { composite, createMaskEditor, isMaskEmpty, maskFromRgba, maskToRgba } from "./refine";

const W = 40;
const H = 30;
const at = (x: number, y: number) => y * W + x;

/** An opaque red base with a fully transparent left column (already removed by Cloudinary). */
function base() {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) rgba.set([200, 20, 30, p % W === 0 ? 0 : 255], p * 4);
  return rgba;
}
const alphaAt = (rgba: Uint8ClampedArray, x: number, y: number) => rgba[at(x, y) * 4 + 3];
function render(mask: Uint8Array) {
  const out = new Uint8ClampedArray(W * H * 4);
  composite(base(), mask, out, W);
  return out;
}

/** One stroke from a to b. */
function stroke(editor: ReturnType<typeof createMaskEditor>, mode: "erase" | "restore", radius: number, ...points: [number, number][]) {
  editor.begin(mode, radius);
  for (const [x, y] of points) editor.to(x, y);
  editor.end();
}

describe("composite", () => {
  it("shows the base where nothing is erased", () => {
    const out = render(new Uint8Array(W * H));
    expect([...out.subarray(at(5, 5) * 4, at(5, 5) * 4 + 4)]).toEqual([200, 20, 30, 255]);
    expect(alphaAt(out, 0, 5)).toBe(0);
  });

  it("makes erased pixels transparent (not white) and keeps their colour", () => {
    const mask = new Uint8Array(W * H);
    mask[at(5, 5)] = 255;
    mask[at(6, 5)] = 128;
    const out = render(mask);
    expect([...out.subarray(at(5, 5) * 4, at(5, 5) * 4 + 4)]).toEqual([200, 20, 30, 0]);
    expect(alphaAt(out, 6, 5)).toBe(127);
  });

  it("only touches the given rect", () => {
    const out = new Uint8ClampedArray(W * H * 4);
    composite(base(), new Uint8Array(W * H), out, W, { x: 2, y: 2, w: 3, h: 3 });
    expect(alphaAt(out, 3, 3)).toBe(255);
    expect(alphaAt(out, 10, 10)).toBe(0);
  });
});

describe("mask encoding", () => {
  it("round-trips through RGBA (as saved to a PNG)", () => {
    const mask = Uint8Array.from({ length: W * H }, (_, i) => (i * 7) % 256);
    const rgba = maskToRgba(mask);
    expect(rgba[3]).toBe(mask[0]);
    expect(rgba[0] + rgba[1] + rgba[2]).toBe(0);
    expect(maskFromRgba(rgba)).toEqual(mask);
  });
});

describe("mask editor", () => {
  it("erases under the brush only", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 3, [10, 10]);
    expect(editor.mask[at(10, 10)]).toBe(255);
    expect(editor.mask[at(20, 20)]).toBe(0);
    expect(alphaAt(render(editor.mask), 10, 10)).toBe(0);
    expect(alphaAt(render(editor.mask), 20, 20)).toBe(255);
  });

  it("fills the gap between distant points of one stroke", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 2, [5, 15], [35, 15]);
    for (let x = 5; x <= 35; x++) expect(editor.mask[at(x, 15)]).toBe(255);
  });

  it("restores erased pixels, but never beyond the base image", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 4, [2, 10]);
    stroke(editor, "restore", 6, [2, 10]);
    expect(isMaskEmpty(editor.mask)).toBe(true);
    const out = render(editor.mask);
    expect(alphaAt(out, 3, 10)).toBe(255);
    expect(alphaAt(out, 0, 10)).toBe(0); // Cloudinary removed it: restore can't invent it
  });

  it("undoes and redoes several steps", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 2, [5, 5]);
    stroke(editor, "erase", 2, [20, 20]);
    stroke(editor, "restore", 3, [5, 5]);
    expect(editor.mask[at(5, 5)]).toBe(0);

    editor.undo();
    expect(editor.mask[at(5, 5)]).toBe(255);
    editor.undo();
    expect(editor.mask[at(20, 20)]).toBe(0);
    editor.undo();
    expect(isMaskEmpty(editor.mask)).toBe(true);
    expect(editor.canUndo).toBe(false);

    editor.redo();
    editor.redo();
    expect(editor.mask[at(5, 5)]).toBe(255);
    expect(editor.mask[at(20, 20)]).toBe(255);
    expect(editor.canRedo).toBe(true);
  });

  it("drops the redo steps after a new stroke", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 2, [5, 5]);
    editor.undo();
    stroke(editor, "erase", 2, [20, 20]);
    expect(editor.canRedo).toBe(false);
    expect(editor.mask[at(5, 5)]).toBe(0);
  });

  it("records nothing for a stroke that changes nothing", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "restore", 4, [10, 10]);
    expect(editor.canUndo).toBe(false);
    expect(editor.dirty).toBe(false);
  });

  it("cancels the stroke in progress (a pinch started)", () => {
    const onChange = vi.fn();
    const editor = createMaskEditor(W, H, undefined, onChange);
    editor.begin("erase", 3);
    editor.to(10, 10);
    expect(editor.drawing).toBe(true);
    editor.cancel();
    expect(editor.drawing).toBe(false);
    expect(isMaskEmpty(editor.mask)).toBe(true);
    expect(editor.canUndo).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2); // the dab, then the revert
  });

  it("resets to the background-removed image as an undoable step", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 3, [10, 10]);
    editor.reset();
    expect(isMaskEmpty(editor.mask)).toBe(true);
    editor.undo();
    expect(editor.mask[at(10, 10)]).toBe(255);
  });

  it("continues from a saved mask, and can restore what it erased", () => {
    const first = createMaskEditor(W, H);
    stroke(first, "erase", 3, [10, 10]);
    const saved = maskFromRgba(maskToRgba(first.mask)); // as reloaded from the stored PNG

    const second = createMaskEditor(W, H, saved);
    expect(second.mask[at(10, 10)]).toBe(255);
    expect(second.dirty).toBe(false);
    expect(second.canUndo).toBe(false); // history doesn't survive a session; the mask does
    stroke(second, "restore", 5, [10, 10]);
    expect(second.mask[at(10, 10)]).toBe(0);
    expect(second.dirty).toBe(true);
    expect(saved[at(10, 10)]).toBe(255); // the saved mask itself isn't modified
  });

  it("is not dirty after undoing back to the start", () => {
    const editor = createMaskEditor(W, H);
    stroke(editor, "erase", 3, [10, 10]);
    expect(editor.dirty).toBe(true);
    editor.undo();
    expect(editor.dirty).toBe(false);
  });

  it("rejects a saved mask of another size", () => {
    expect(() => createMaskEditor(W, H, new Uint8Array(10))).toThrow(/doesn't match/);
  });

  it("reports changed regions for redrawing", () => {
    const onChange = vi.fn();
    const editor = createMaskEditor(W, H, undefined, onChange);
    stroke(editor, "erase", 2, [10, 10]);
    const rect = onChange.mock.calls[0][0];
    expect(rect.x).toBeLessThanOrEqual(8);
    expect(rect.x + rect.w).toBeGreaterThanOrEqual(12);
    expect(rect.w).toBeLessThan(W);
  });
});
