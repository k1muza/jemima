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
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "staff@example.com" } } }) },
    from: (table: string) => query(table),
  };
  const writes = (table: string, method: "insert" | "update") =>
    calls.filter((c) => c.table === table && c.method === method).map((c) => c.args[0]);
  return { client: client as unknown as Parameters<typeof createSupabaseInventory>[0], calls, writes };
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
