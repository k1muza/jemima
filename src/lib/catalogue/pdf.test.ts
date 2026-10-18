import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PDFDocument } from "pdf-lib";

import { newCatalogue, type CatalogueItem } from "./model";
import { buildCataloguePdf } from "./pdf";

const item = (i: number): CatalogueItem => ({
  id: `product-${i}`,
  name: `Soft Cotton Shirt ${i}`,
  type: "Shirts",
  price: "$20",
  colours: [{ name: "Sage", hex: "#809078" }],
  cover: {
    hex: "#809078",
    link: "https://wa.me/p/7429384729384723/263771234567",
  },
  thumbs: [],
});

describe("server-side catalogue PDF renderer", () => {
  it.each(["Classic", "Atelier", "Lookbook", "Boutique"] as const)(
    "renders a readable two-page %s PDF with four products and clickable photos",
    async (theme) => {
      const catalogue = newCatalogue(`catalogue-${theme}`, { theme, cover: true });
      const bytes = await buildCataloguePdf({
        catalogue,
        items: [1, 2, 3, 4].map(item),
        storeName: "Jemima's Designs",
      });
      expect([...bytes.slice(0, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("%PDF");
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(2);
      // WhatsApp annotations should still be embedded on the four product photos.
      const annotations = pdf.getPage(1).node.Annots();
      expect(annotations?.size()).toBe(4);
    },
    20_000,
  );
});
