import { SIZE_TEMPLATES, type Category, type Product } from "./types";

type SeedRow = [
  name: string,
  category: Category,
  type: string,
  skuPrefix: string,
  cost: number,
  price: number,
  variants: [colour: string, style: string, hex: string][],
  /** 0 = well stocked, 1 = some low sizes, 2 = last variant sold out */
  lowness: 0 | 1 | 2,
  noPhotos?: boolean,
];

const SEED: SeedRow[] = [
  ["Merino Crew Knit", "Clothing", "Knitwear", "KN", 52, 129, [["Oatmeal", "Regular", "#d9cbb3"], ["Charcoal", "Regular", "#3f3f42"], ["Forest", "Relaxed", "#2f4a3a"]], 0],
  ["Linen Camp Shirt", "Clothing", "Shirts", "SH", 34, 89, [["Ecru", "Short sleeve", "#ece3d0"], ["Sky", "Short sleeve", "#a9c3d8"], ["Sky", "Long sleeve", "#a9c3d8"]], 1],
  ["Wide-Leg Trouser", "Clothing", "Trousers", "TR", 44, 110, [["Black", "Pleated", "#1d1d1f"], ["Stone", "Pleated", "#b8ad98"]], 0],
  ["Heavyweight Tee", "Clothing", "Tops", "TE", 11, 35, [["White", "Boxy", "#f4f2ee"], ["Black", "Boxy", "#1d1d1f"], ["Navy", "Boxy", "#2c3a55"], ["Clay", "Boxy", "#b5694a"]], 1],
  ["Waxed Field Jacket", "Clothing", "Outerwear", "OW", 118, 289, [["Olive", "", "#5b5a3a"], ["Navy", "", "#25304a"]], 2],
  ["Pleated Midi Skirt", "Clothing", "Skirts", "SK", 32, 85, [["Black", "A-line", "#1d1d1f"], ["Rust", "A-line", "#9a4a2a"]], 0],
  ["Selvedge Denim", "Clothing", "Denim", "DN", 58, 149, [["Indigo", "Straight", "#2b3550"], ["Indigo", "Slim", "#2b3550"], ["Black", "Straight", "#1d1d1f"]], 1],
  ["Hooded Sweatshirt", "Clothing", "Tops", "HD", 29, 75, [["Grey marl", "Pullover", "#a3a3a3"], ["Black", "Zip", "#1d1d1f"]], 0],
  ["Leather Court Sneaker", "Shoes", "Sneakers", "SN", 66, 165, [["White", "Low", "#f4f2ee"], ["White", "High", "#f4f2ee"], ["Black", "Low", "#1d1d1f"]], 1],
  ["Suede Chelsea Boot", "Shoes", "Boots", "BT", 92, 220, [["Tan", "", "#a87650"], ["Chocolate", "", "#4a3326"]], 0],
  ["Canvas Plimsoll", "Shoes", "Sneakers", "PL", 19, 55, [["Natural", "", "#e8dfcc"], ["Navy", "", "#25304a"], ["Red", "", "#a63a32"]], 2],
  ["Penny Loafer", "Shoes", "Formal", "LF", 78, 190, [["Black", "", "#1d1d1f"], ["Oxblood", "", "#5a2228"]], 1],
  ["Trail Runner", "Shoes", "Sport", "", 64, 150, [["Slate", "", "#5d6670"], ["Sand", "", "#cdb991"]], 0],
  ["Leather Sandal", "Shoes", "Sandals", "SD", 38, 95, [["Tan", "Two-strap", "#a87650"], ["Black", "Two-strap", "#1d1d1f"]], 0, true],
];

/** Deterministic PRNG so the demo catalogue is identical on server and client. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SEED_DATE = "2026-10-01T09:00:00.000Z";

export function seedProducts(): Product[] {
  const random = rng(11);
  return SEED.map(([name, category, type, prefix, cost, price, variantRows, lowness, noPhotos], i) => {
    const sizes = SIZE_TEMPLATES[category].slice();
    const variants = variantRows.map(([colourName, style, colourHex], j) => {
      const qty: Record<string, number> = {};
      sizes.forEach((size, k) => {
        const edgeSize = category === "Shoes" && (k === 0 || k === sizes.length - 1);
        const r = random();
        qty[size] =
          lowness === 2 && j === variantRows.length - 1
            ? 0
            : lowness && r < 0.2
              ? Math.floor(random() * 4)
              : 4 + Math.floor(random() * (edgeSize ? 4 : 16));
      });
      return { id: `v${i}-${j}`, colourName, colourHex, colourStatus: "detected" as const, style, qty };
    });

    const photos = noPhotos
      ? []
      : variants.flatMap((v, j) =>
          Array.from({ length: j === 0 ? 2 : 1 }, (_, k) => ({ id: `p${i}-${j}-${k}`, variantId: v.id, hex: v.colourHex })),
        );

    return {
      id: `prod${i}`,
      name,
      category,
      type,
      sku: prefix ? `${prefix}-${1040 + i * 37}` : "",
      costCents: cost * 100,
      priceCents: price * 100,
      sizes,
      variants,
      photos,
      updatedAt: SEED_DATE,
    };
  });
}
