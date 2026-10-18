import { describe, expect, it } from "vitest";

import { colourDistance, garmentColour, nameColour, normaliseHex, sampleColour } from "./colour";

/** A width×height RGBA image filled by `pixel(x, y)`. */
function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { data, width, height };
}

describe("sampleColour", () => {
  it("averages the patch around the point", () => {
    const img = image(5, 5, (x) => (x % 2 ? [200, 0, 0, 255] : [100, 0, 0, 255]));
    // 3×3 patch centred on x=2: columns 1, 2, 3 → 200, 100, 200.
    expect(sampleColour(img, 2, 2, 1)).toBe("#a70000");
  });

  it("ignores transparent pixels and clips at the edges", () => {
    const img = image(3, 3, (x, y) => (x === 0 && y === 0 ? [0, 0, 255, 255] : [255, 255, 255, 0]));
    expect(sampleColour(img, 0, 0, 2)).toBe("#0000ff");
  });

  it("returns null over a removed background", () => {
    expect(sampleColour(image(4, 4, () => [10, 10, 10, 0]), 2, 2)).toBeNull();
  });
});

describe("normaliseHex", () => {
  it("accepts short and long forms, with or without #", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(normaliseHex(" 3b5ea8 ")).toBe("#3b5ea8");
  });

  it("rejects anything else", () => {
    expect(normaliseHex("#12345")).toBeNull();
    expect(normaliseHex("navy")).toBeNull();
  });
});

describe("garmentColour", () => {
  const MINT: [number, number, number, number] = [150, 225, 205, 255];
  const FLOOR: [number, number, number, number] = [40, 32, 28, 255];
  const WALL: [number, number, number, number] = [235, 232, 225, 255];

  it("finds a garment on a background of two colours (wall above, dark floor below)", () => {
    const img = image(64, 64, (x, y) => {
      if (Math.abs(x - 32) < 16 && Math.abs(y - 34) < 20) return MINT;
      return y < 20 ? WALL : FLOOR;
    });
    expect(nameColour(garmentColour(img)!)).toBe("Mint");
    expect(colourDistance(garmentColour(img)!, "#96e1cd")).toBeLessThan(10);
  });

  it("keeps a garment that fills the frame, edges included", () => {
    const img = image(64, 64, (x, y) => (Math.abs(x - 32) < 4 && Math.abs(y - 32) < 4 ? WALL : [176, 50, 44, 255]));
    expect(nameColour(garmentColour(img)!)).toBe("Red");
  });

  it("ignores a removed background", () => {
    const img = image(64, 64, (x, y) => (Math.abs(x - 32) < 14 && Math.abs(y - 32) < 18 ? [37, 48, 74, 255] : [0, 0, 0, 0]));
    expect(nameColour(garmentColour(img)!)).toBe("Navy");
  });
});
