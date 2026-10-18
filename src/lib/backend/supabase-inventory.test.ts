import { describe, expect, it } from "vitest";

import type { Product } from "@/lib/inventory/types";

import { createSupabaseInventory } from "./supabase-inventory";

const ITEM = "https://wa.me/p/7429384729384723/263771234567";

type Call = { table: string; method: string; args: unknown[] };

/** A stand-in Supabase client: records every query and answers each table with `results`. */
function fakeClient(results: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const query = (table: string) => {
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_, method: string) {
          if (method === "then") {
            return (resolve: (r: unknown) => void) => resolve({ data: results[table] ?? null, error: null });
          }
          return (...args: unknown[]) => {
            calls.push({ table, method, args });
            return builder;
          };
        },
      },
    );
    return builder;
  };
  /** Files in the photo bucket; signing a missing one returns no link, like Supabase. */
  const stored = new Set<string>();
  const bucket = {
    createSignedUrls: async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: stored.has(path) ? `https://storage.example/${path}?token=1` : null })),
      error: null,
    }),
    upload: async (...args: unknown[]) => {
      calls.push({ table: "storage", method: "upload", args });
      stored.add(args[0] as string);
      return { data: {}, error: null };
    },
    remove: async (paths: string[]) => {
      calls.push({ table: "storage", method: "remove", args: [paths] });
      paths.forEach((p) => stored.delete(p));
      return { data: [], error: null };
    },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "staff@example.com" } } }) },
    from: (table: string) => query(table),
    storage: { from: () => bucket },
  };
  const writes = (table: string, method: "insert" | "update") =>
    calls.filter((c) => c.table === table && c.method === method).map((c) => c.args[0]);
  return { client: client as unknown as Parameters<typeof createSupabaseInventory>[0], calls, writes, stored };
}

const product = (patch: Partial<Product> = {}): Product => ({
  id: "prod",
  name: "",
  category: "Clothing",
  type: "",
  sku: "",
  costCents: 0,
  priceCents: 0,
  sizes: [],
  variants: [],
  photos: [],
  updatedAt: "2026-10-18T00:00:00Z",
  ...patch,
});

describe("WhatsApp catalogue URL in Supabase", () => {
  it("creates products without a link as null", async () => {
    const { client, writes } = fakeClient();
    await createSupabaseInventory(client).createProduct(product());
    expect(writes("products", "insert")).toEqual([
      { id: "prod", name: "", category: "Clothing", whatsapp_catalog_url: null },
    ]);
  });

  it("creates products with a link in its canonical form", async () => {
    const { client, writes } = fakeClient();
    await createSupabaseInventory(client).createProduct(product({ whatsappCatalogUrl: `wa.me/p/7429384729384723/263771234567/` }));
    expect(writes("products", "insert")).toEqual([expect.objectContaining({ whatsapp_catalog_url: ITEM })]);
  });

  it("sets, changes and removes the link", async () => {
    const { client, writes } = fakeClient();
    const inventory = createSupabaseInventory(client);
    await inventory.updateProduct("prod", { whatsappCatalogUrl: ITEM });
    await inventory.updateProduct("prod", { whatsappCatalogUrl: "https://wa.me/p/111/263771234567" });
    await inventory.updateProduct("prod", { whatsappCatalogUrl: "" });
    expect(writes("products", "update")).toEqual([
      { whatsapp_catalog_url: ITEM },
      { whatsapp_catalog_url: "https://wa.me/p/111/263771234567" },
      { whatsapp_catalog_url: null },
    ]);
  });

  it("leaves the link alone when other fields are updated", async () => {
    const { client, writes } = fakeClient();
    await createSupabaseInventory(client).updateProduct("prod", { name: "Linen dress", priceCents: 4500 });
    expect(writes("products", "update")).toEqual([{ name: "Linen dress", default_price_cents: 4500 }]);
  });

  it("rejects an invalid link without sending it", async () => {
    const { client, calls } = fakeClient();
    const inventory = createSupabaseInventory(client);
    await expect(inventory.updateProduct("prod", { whatsappCatalogUrl: "https://example.com/p/1/263771234567" })).rejects.toThrow(
      /WhatsApp catalogue item link/,
    );
    await expect(inventory.createProduct(product({ whatsappCatalogUrl: "nope" }))).rejects.toThrow(/WhatsApp/);
    expect(calls.filter((c) => c.method === "update" || c.method === "insert")).toEqual([]);
  });

  it("loads the link, and none for products without one", async () => {
    const row = (id: string, whatsapp_catalog_url: string | null) => ({
      id,
      name: id,
      category: "Clothing",
      type: "",
      sku: "",
      default_price_cents: 0,
      whatsapp_catalog_url,
      updated_at: "2026-10-18T00:00:00Z",
      product_costs: null,
      product_sizes: [],
      product_variants: [],
      product_images: [],
    });
    const { client, calls } = fakeClient({
      profiles: { role: "staff" },
      products: [row("linked", ITEM), row("plain", null)],
      stock_movements: [],
      shop_settings: { low_stock_threshold: 3 },
      size_templates: [],
      product_types: [],
      catalogues: [],
    });
    const { products } = await createSupabaseInventory(client).load();
    expect(calls.find((c) => c.table === "products" && c.method === "select")!.args[0]).toContain("whatsapp_catalog_url");
    expect(products.find((p) => p.id === "linked")!.whatsappCatalogUrl).toBe(ITEM);
    expect(products.find((p) => p.id === "plain")).not.toHaveProperty("whatsappCatalogUrl");
  });
});

describe("Photo thumbnails in Supabase", () => {
  const image = (patch: Record<string, unknown> = {}) => ({
    id: "ph",
    variant_id: null,
    detected_hex: "#aabbcc",
    sort_order: 0,
    created_at: "2026-10-18T00:00:00Z",
    storage_path: "prod/ph.jpg",
    cutout_path: null,
    show_cutout: false,
    refined_path: null,
    mask_path: null,
    enhanced_path: null,
    cutout_enhanced_path: null,
    refined_enhanced_path: null,
    show_enhanced: false,
    ironed_path: null,
    show_ironed: false,
    updated_at: "2026-10-18T00:00:00Z",
    ...patch,
  });
  const tables = (images: unknown[]) => ({
    profiles: { role: "staff" },
    products: [
      {
        id: "prod",
        name: "",
        category: "Clothing",
        type: "",
        sku: "",
        default_price_cents: 0,
        whatsapp_catalog_url: null,
        updated_at: "2026-10-18T00:00:00Z",
        product_costs: null,
        product_sizes: [],
        product_variants: [],
        product_images: images,
      },
    ],
    stock_movements: [],
    shop_settings: { low_stock_threshold: 3 },
    size_templates: [],
    product_types: [],
    catalogues: [],
  });

  it("pairs each file with its thumbnail, and lists files that have none", async () => {
    const { client, stored } = fakeClient(
      tables([image({ cutout_path: "prod/ph.cutout.png", refined_path: "prod/ph.refined.png", mask_path: "prod/ph.mask.png" })]),
    );
    ["prod/ph.jpg", "prod/ph.jpg.thumb", "prod/ph.cutout.png", "prod/ph.refined.png", "prod/ph.mask.png"].forEach((p) => stored.add(p));
    const { images, thumbs, missingThumbs } = await createSupabaseInventory(client).load();

    expect(thumbs).toEqual({ [images.ph]: "https://storage.example/prod/ph.jpg.thumb?token=1" });
    // Masks are never shown, so they get no thumbnail.
    expect(missingThumbs.map((m) => m.path)).toEqual(["prod/ph.cutout.png", "prod/ph.refined.png"]);
    expect(missingThumbs[0].url).toBe(images["ph:cutout"]);
  });

  it("removes a photo's thumbnails with its files", async () => {
    const { client, calls } = fakeClient();
    await createSupabaseInventory(client).removePhoto("prod", "ph");
    const removed = calls.find((c) => c.table === "storage" && c.method === "remove")!.args[0] as string[];
    expect(removed).toEqual(expect.arrayContaining(["prod/ph.jpg", "prod/ph.jpg.thumb", "prod/ph.cutout.png.thumb"]));
    expect(removed).not.toContain("prod/ph.mask.png.thumb");
  });

  it("drops the old thumbnail when a new one can't be made, so lists show the new file", async () => {
    // No canvas in tests, so making the thumbnail fails.
    const { client, stored } = fakeClient();
    stored.add("prod/ph.jpg.thumb");
    await createSupabaseInventory(client).replacePhotoFile("prod", "ph", "data:image/jpeg;base64,/9j/");
    expect(stored.has("prod/ph.jpg")).toBe(true);
    expect(stored.has("prod/ph.jpg.thumb")).toBe(false);
  });
});
