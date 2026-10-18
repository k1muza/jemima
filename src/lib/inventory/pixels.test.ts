import { describe, expect, it } from "vitest";

import { copyAlpha } from "./pixels";

describe("copyAlpha", () => {
  it("takes the colours of the enhanced image and the transparency of the version it came from", () => {
    // Pixel 1: background removed (alpha 0). Pixel 2: product, partly erased edge (alpha 128).
    const source = new Uint8ClampedArray([10, 20, 30, 0, 100, 110, 120, 128]);
    // The processor brightened everything and (wrongly) made the background opaque again.
    const enhanced = new Uint8ClampedArray([200, 200, 200, 255, 130, 140, 150, 255]);
    expect([...copyAlpha(enhanced, source)]).toEqual([200, 200, 200, 0, 130, 140, 150, 128]);
  });

  it("refuses images of different sizes", () => {
    expect(() => copyAlpha(new Uint8ClampedArray(8), new Uint8ClampedArray(4))).toThrow(/size/);
  });
});
