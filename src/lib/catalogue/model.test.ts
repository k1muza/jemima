import { describe, expect, it } from "vitest";

import type { Product } from "@/lib/inventory/types";

import { catalogueItems, cataloguePages, newCatalogue, pageCount, type CatalogueItem } from "./model";
import { catalogueHtml } from "./web";

const item = (n: number): CatalogueItem => ({
  id: `p${n}`,
  name: `Piece <${n}>`,
  type: "Dress",
  price: "$10.00",
  colours: [{ name: "Black", hex: "#000000" }],
  cover: { hex: "#cccccc" },
  thumbs: [],
});
const items = Array.from({ length: 9 }, (_, i) => item(i + 1));

describe("catalogue themes", () => {
  it("defaults new catalogues to Classic", () => {
    expect(newCatalogue("c1").theme).toBe("Classic");
  });

  it("fits four products to each theme's grid pages", () => {
    for (const theme of ["Classic", "Atelier", "Lookbook", "Boutique"] as const) {
      const catalogue = newCatalogue("c1", { theme });
      expect(cataloguePages(catalogue, items).map((p) => p.kind === "grid" && p.items.length)).toEqual([4, 4, 1]);
      expect(pageCount(catalogue, items)).toBe(4); // including the cover
    }
  });

  it("keeps one item per page for the Feature layout", () => {
    const catalogue = newCatalogue("c2", { layout: "Feature" });
    expect(cataloguePages(catalogue, items)).toHaveLength(9);
    expect(pageCount(catalogue, items)).toBe(10);
  });

  it("builds the web page in the chosen design, escaping product text", () => {
    const html = catalogueHtml({ catalogue: newCatalogue("c3", { theme: "Boutique" }), items, storeName: "Jemima's" });
    expect(html).toContain("#b4553d");
    expect(html).toContain("Piece &lt;1&gt;");
    expect(html).toContain("Jemima&#39;s");
    expect(html).not.toContain("<1>");
  });

  it("links product photos to their WhatsApp catalogue item", () => {
    const link = "https://wa.me/p/7429384729384723/263771234567";
    const linked = [{ ...item(1), cover: { hex: "#cccccc", link } }, item(2)];
    const html = catalogueHtml({ catalogue: newCatalogue("c4", { cover: false }), items: linked, storeName: "Jemima's" });
    expect(html).toContain(`<a class="photo" href="${link}" target="_blank"`);
    expect(html.match(/<a class="photo"/g)).toHaveLength(1); // the unlinked piece stays a plain photo
  });
});

describe("photo backdrops", () => {
  it("uses every tone in turn when there is nothing to contrast with", async () => {
    const { backdropPicker, PHOTO_BACKDROPS } = await import("./model");
    const pick = backdropPicker();
    expect(PHOTO_BACKDROPS.map(() => pick())).toEqual(PHOTO_BACKDROPS);
  });

  it("puts light pieces on dark tones and dark pieces on light ones, taking turns", async () => {
    const { backdropPicker } = await import("./model");
    const pick = backdropPicker();
    const light = 0.92;
    const dark = 0.1;
    // charcoal, olive, slate for light pieces; oatmeal, ecru, mist for dark ones.
    expect([pick(light), pick(dark), pick(light), pick(light), pick(dark), pick(light)]).toEqual([
      "#1f1e1d",
      "#d9ccb6",
      "#5d5f41",
      "#5b636f",
      "#ece4d4",
      "#1f1e1d",
    ]);
  });

  it("uses the furthest tone for a mid-tone piece", async () => {
    const { backdropPicker } = await import("./model");
    expect(backdropPicker()(0.55)).toBe("#1f1e1d");
  });

  it("follows the measured photo over the variant colour", async () => {
    const product = {
      id: "p1",
      name: "Tee",
      category: "Clothing",
      type: "Tee",
      priceCents: 1000,
      variants: [{ id: "v1", colourName: "Black", colourHex: "#111111" }],
      photos: [{ id: "ph1", variantId: "v1" }],
    } as unknown as Product;
    const catalogue = newCatalogue("c", { productIds: ["p1"], hideSoldOut: false });
    const images = { ph1: "blob:photo" };
    // A "black" variant whose photo is actually light gets a dark tone.
    expect(catalogueItems(catalogue, [product], images, { "blob:photo": 0.9 })[0].cover.backdrop).toBe("#1f1e1d");
    expect(catalogueItems(catalogue, [product], images)[0].cover.backdrop).toBe("#d9ccb6");
  });
});
