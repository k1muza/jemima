import { describe, expect, it } from "vitest";

import { cutoutKey } from "./cutout";
import { photoFiles, safeFileName } from "./photo-export";
import type { Product } from "./types";

const product = (patch: Partial<Product>): Product => ({
  id: "p1",
  name: "Wrap dress",
  category: "Clothing",
  type: "Dresses",
  sku: "WD-01",
  costCents: 0,
  priceCents: 0,
  sizes: [],
  variants: [
    { id: "v1", colourName: "Red", colourHex: "#f00", colourStatus: "detected", style: "", qty: {} },
    { id: "v2", colourName: "Navy", colourHex: "#008", colourStatus: "detected", style: "Long", qty: {} },
  ],
  photos: [],
  updatedAt: "",
  ...patch,
});

describe("safeFileName", () => {
  it("removes characters file systems reject", () => {
    expect(safeFileName('A/B: "C"?')).toBe("A B C");
    expect(safeFileName("  ...  ")).toBe("Untitled");
  });
});

describe("photoFiles", () => {
  it("names photos by product folder, order and colour, using the version shown", () => {
    const files = photoFiles(
      [
        product({
          photos: [
            { id: "a", variantId: "v1", hex: "" },
            { id: "b", variantId: "v2", hex: "", hasCutout: true, showCutout: true },
            { id: "c", variantId: "v1", hex: "" },
          ],
        }),
      ],
      { a: "data:a", b: "data:b", [cutoutKey("b")]: "data:b-cut" },
    );
    expect(files).toEqual([
      { url: "data:a", path: "Wrap dress (WD-01)/01 Red" },
      { url: "data:b-cut", path: "Wrap dress (WD-01)/02 Navy Long" },
    ]);
  });
});
