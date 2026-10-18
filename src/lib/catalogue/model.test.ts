import { describe, expect, it } from "vitest";

import { cataloguePages, newCatalogue, pageCount, type CatalogueItem } from "./model";
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

  it("fits six products to a grid page, or four in Lookbook", () => {
    expect(cataloguePages(newCatalogue("c1"), items).map((p) => p.kind === "grid" && p.items.length)).toEqual([6, 3]);
    const lookbook = newCatalogue("c2", { theme: "Lookbook" });
    expect(cataloguePages(lookbook, items).map((p) => p.kind === "grid" && p.items.length)).toEqual([4, 4, 1]);
    expect(pageCount(lookbook, items)).toBe(4); // with the cover
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
