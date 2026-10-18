import type { SupabaseClient } from "@supabase/supabase-js";

import { cutoutKey, enhancedKey, ironedKey, maskKey, refinedKey, type PhotoVersion } from "@/lib/inventory/cutout";
import { seedSettings } from "@/lib/inventory/seed";
import type {
  Access,
  Catalogue,
  CataloguePageLayout,
  CatalogueTheme,
  Category,
  ColourStatus,
  Photo,
  Product,
  ProductPatch,
  ShopSettings,
  StaffMember,
  StockMovement,
  Variant,
} from "@/lib/inventory/types";
import { normalizeWhatsappCatalogUrl } from "@/lib/inventory/whatsapp";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** The stored column value: null for no link. The database rejects anything but the canonical form too. */
function whatsappCatalogUrlColumn(value: string | undefined) {
  const url = normalizeWhatsappCatalogUrl(value ?? "");
  if (url === null) throw new Error("That isn't a WhatsApp catalogue item link (https://wa.me/p/…).");
  return url || null;
}

export const PHOTO_BUCKET = "product-images";
/** Signed photo links last long enough for a working day; reloading refreshes them. */
const SIGNED_URL_SECONDS = 60 * 60 * 12;
const HISTORY_LIMIT = 1000;

export const photoPath = (productId: string, photoId: string) => `${productId}/${photoId}.jpg`;
export const cutoutPath = (productId: string, photoId: string) => `${productId}/${photoId}.cutout.png`;
export const refinedPath = (productId: string, photoId: string) => `${productId}/${photoId}.refined.png`;
export const maskPath = (productId: string, photoId: string) => `${productId}/${photoId}.mask.png`;
/** The enhanced copy of a version: JPEG for the original, PNG (with transparency) otherwise. */
export const enhancedPath = (productId: string, photoId: string, version: PhotoVersion) =>
  version === "original" ? `${productId}/${photoId}.enhanced.jpg` : `${productId}/${photoId}.${version}.enhanced.png`;
const ENHANCED_COLUMN = {
  original: "enhanced_path",
  cutout: "cutout_enhanced_path",
  refined: "refined_enhanced_path",
} as const satisfies Record<PhotoVersion, string>;
const VERSIONS: PhotoVersion[] = ["original", "cutout", "refined"];
const enhancedColumn = (version: PhotoVersion, path: string | null) =>
  ({ [ENHANCED_COLUMN[version]]: path }) as Partial<Record<(typeof ENHANCED_COLUMN)[PhotoVersion], string | null>>;
/** Every file of a photo (most may not exist; removing a missing file is harmless). */
const photoFiles = (productId: string, photoId: string) => [
  photoPath(productId, photoId),
  cutoutPath(productId, photoId),
  refinedPath(productId, photoId),
  maskPath(productId, photoId),
  ...VERSIONS.map((v) => enhancedPath(productId, photoId, v)),
];

export type InventorySnapshot = {
  access: Access;
  actor: string;
  products: Product[];
  movements: StockMovement[];
  settings: ShopSettings;
  threshold: number;
  catalogues: Catalogue[];
  /** Photo id (or `cutoutKey(id)`, `refinedKey(id)`, `maskKey(id)`, `enhancedKey(id, version)`) → signed URL. */
  images: Record<string, string>;
};

/** Data that must be present (a list or the settings row). */
function need<T>(data: T | null): T {
  if (data == null) throw new Error("The inventory database returned no data. Check the migrations have been applied.");
  return data;
}

/** Throw a readable error for a failed Supabase call. */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

type CatalogueRow = Database["public"]["Tables"]["catalogues"]["Row"];

const catalogueFromRow = (row: CatalogueRow): Catalogue => ({
  id: row.id,
  name: row.name,
  title: row.title,
  subtitle: row.subtitle,
  layout: row.layout === "feature" ? "Feature" : "Grid",
  theme: themeFromColumn(row.theme),
  cover: row.show_cover,
  showPrices: row.show_prices,
  showColours: row.show_colours,
  hideSoldOut: row.hide_sold_out,
  productIds: row.product_ids,
  department: row.department === "Clothing" || row.department === "Shoes" ? row.department : "All",
  colourFilter: row.colour_filter,
});

const layoutColumn = (layout: CataloguePageLayout) => (layout === "Feature" ? "feature" : "grid");

const THEMES: CatalogueTheme[] = ["Classic", "Atelier", "Lookbook", "Boutique"];
// Rows from before the theme column existed read as Classic.
const themeFromColumn = (value: string | undefined) =>
  THEMES.find((t) => t.toLowerCase() === value) ?? "Classic";

/** Only the fields present in `c`, as column values. */
function catalogueColumns(c: Partial<Omit<Catalogue, "id">>) {
  return {
    ...(c.name !== undefined && { name: c.name }),
    ...(c.title !== undefined && { title: c.title }),
    ...(c.subtitle !== undefined && { subtitle: c.subtitle }),
    ...(c.layout !== undefined && { layout: layoutColumn(c.layout) }),
    ...(c.theme !== undefined && { theme: c.theme.toLowerCase() }),
    ...(c.cover !== undefined && { show_cover: c.cover }),
    ...(c.showPrices !== undefined && { show_prices: c.showPrices }),
    ...(c.showColours !== undefined && { show_colours: c.showColours }),
    ...(c.hideSoldOut !== undefined && { hide_sold_out: c.hideSoldOut }),
    ...(c.productIds !== undefined && { product_ids: c.productIds }),
    ...(c.department !== undefined && { department: c.department }),
    ...(c.colourFilter !== undefined && { colour_filter: c.colourFilter }),
  };
}

const PRODUCT_SELECT = `
  id, name, category, type, sku, default_price_cents, whatsapp_catalog_url, updated_at,
  product_costs ( default_cost_cents ),
  product_sizes ( label, sort_order ),
  product_variants (
    id, colour_name, colour_hex, colour_status, style_label, sort_order, created_at,
    inventory_skus ( quantity_on_hand, product_sizes ( label ) )
  ),
  product_images ( id, variant_id, detected_hex, sort_order, created_at, storage_path, cutout_path, show_cutout, refined_path, mask_path, enhanced_path, cutout_enhanced_path, refined_enhanced_path, show_enhanced, ironed_path, show_ironed )
` as const;

/** Data access for the inventory, via the browser client. Row-level security decides what each person can see and do. */
export function createSupabaseInventory(supabase: Client) {
  async function loadAccess() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) throw new Error("You're signed out. Sign in again to continue.");
    const profile = check(
      await supabase
        .from("profiles")
        .select("role, can_view_costs, can_edit_prices, full_name, email")
        .eq("id", user.id)
        .maybeSingle(),
    );
    const role = profile?.role ?? "pending";
    return {
      access: {
        role,
        canViewCosts: role === "owner" || (role === "staff" && !!profile?.can_view_costs),
        canEditPrices: role === "owner" || (role === "staff" && !!profile?.can_edit_prices),
      } satisfies Access,
      actor: profile?.full_name || profile?.email || user.email || "",
    };
  }

  async function loadStaff(): Promise<StaffMember[]> {
    const [profiles, invites] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, role, can_view_costs, can_edit_prices, created_at")
        .order("created_at"),
      supabase.from("staff_invites").select("email, name, can_view_costs, can_edit_prices").order("created_at"),
    ]);
    return [
      ...need(check(profiles)).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || "Unnamed",
        email: p.email ?? "",
        role: p.role === "owner" ? ("Owner" as const) : ("Staff" as const),
        canViewCosts: p.role === "owner" || p.can_view_costs,
        canEditPrices: p.role === "owner" || p.can_edit_prices,
        status: p.role === "pending" ? ("pending" as const) : ("active" as const),
      })),
      ...need(check(invites)).map((i) => ({
        id: `invite:${i.email}`,
        name: i.name,
        email: i.email,
        role: "Staff" as const,
        canViewCosts: i.can_view_costs,
        canEditPrices: i.can_edit_prices,
        status: "invited" as const,
      })),
    ];
  }

  return {
    async load(): Promise<InventorySnapshot> {
      const { access, actor } = await loadAccess();
      if (access.role === "pending") {
        return {
          access,
          actor,
          products: [],
          movements: [],
          settings: seedSettings(),
          threshold: 3,
          catalogues: [],
          images: {},
        };
      }

      const [products, movements, shop, templates, types, catalogues, staff] = await Promise.all([
        supabase.from("products").select(PRODUCT_SELECT).neq("status", "archived").order("created_at", { ascending: false }),
        supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
        supabase.from("shop_settings").select("*").single(),
        supabase.from("size_templates").select("category, sizes"),
        supabase.from("product_types").select("category, name, sort_order").order("sort_order"),
        supabase.from("catalogues").select("*").order("created_at"),
        access.role === "owner" ? loadStaff() : Promise.resolve<StaffMember[]>([]),
      ]);

      const rows = need(check(products));
      const imagePaths: { id: string; path: string }[] = [];
      const mapped: Product[] = rows.map((row) => {
        const sizes = [...row.product_sizes].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.label);
        const variants: Variant[] = [...row.product_variants]
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map((v) => ({
            id: v.id,
            colourName: v.colour_name,
            colourHex: v.colour_hex,
            colourStatus: v.colour_status as ColourStatus,
            style: v.style_label,
            qty: Object.fromEntries(
              sizes.map((size) => [
                size,
                v.inventory_skus.find((k) => k.product_sizes?.label.toUpperCase() === size.toUpperCase())?.quantity_on_hand ?? 0,
              ]),
            ),
          }));
        const photos: Photo[] = [...row.product_images]
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map((img) => {
            imagePaths.push({ id: img.id, path: img.storage_path });
            if (img.ironed_path) imagePaths.push({ id: ironedKey(img.id), path: img.ironed_path });
            if (img.cutout_path) imagePaths.push({ id: cutoutKey(img.id), path: img.cutout_path });
            if (img.refined_path && img.mask_path) {
              imagePaths.push({ id: refinedKey(img.id), path: img.refined_path }, { id: maskKey(img.id), path: img.mask_path });
            }
            for (const v of VERSIONS) {
              const path = img[ENHANCED_COLUMN[v]];
              if (path) imagePaths.push({ id: enhancedKey(img.id, v), path });
            }
            return {
              id: img.id,
              variantId: img.variant_id ?? variants[0]?.id ?? "",
              hex: img.detected_hex ?? "#9a948a",
              ...(img.cutout_path && { hasCutout: true, showCutout: img.show_cutout }),
              ...(img.cutout_path && img.refined_path && { refined: true }),
              ...(img.show_enhanced && { enhanced: true }),
              ...(img.ironed_path && { hasIroned: true, showIroned: img.show_ironed }),
            };
          });
        const cost = Array.isArray(row.product_costs) ? row.product_costs[0] : row.product_costs;
        return {
          id: row.id,
          name: row.name,
          category: row.category as Category,
          type: row.type,
          sku: row.sku,
          costCents: cost?.default_cost_cents ?? 0,
          priceCents: row.default_price_cents,
          sizes,
          variants,
          photos,
          ...(row.whatsapp_catalog_url && { whatsappCatalogUrl: row.whatsapp_catalog_url }),
          updatedAt: row.updated_at,
        };
      });

      const images: Record<string, string> = {};
      if (imagePaths.length) {
        const remote = imagePaths.filter((i) => /^https:\/\//.test(i.path));
        for (const { id, path } of remote) images[id] = path;
        const stored = imagePaths.filter((i) => !/^https:\/\//.test(i.path));
        if (stored.length) {
          const signed = need(
            check(
              await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(
                stored.map((i) => i.path),
                SIGNED_URL_SECONDS,
              ),
            ),
          );
          const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
          for (const { id, path } of stored) {
            const url = byPath.get(path);
            if (url) images[id] = url;
          }
        }
      }

      const s = need(check(shop));
      const defaults = seedSettings();
      const sizeTemplates = { ...defaults.sizeTemplates };
      for (const t of need(check(templates))) sizeTemplates[t.category as Category] = t.sizes;
      const productTypes: ShopSettings["productTypes"] = { Clothing: [], Shoes: [] };
      for (const t of need(check(types))) productTypes[t.category as Category].push(t.name);

      return {
        access,
        actor,
        products: mapped,
        movements: need(check(movements)).map((m) => ({
          id: m.id,
          productId: m.product_id ?? "",
          variantId: m.variant_id ?? "",
          size: m.size_label,
          delta: m.delta,
          before: m.quantity_before,
          after: m.quantity_after,
          reason: m.reason,
          note: m.note,
          actor: m.actor_name,
          at: m.created_at,
          productName: m.product_name,
          colourName: m.colour_name,
          styleLabel: m.style_label,
        })),
        settings: {
          shopName: s.shop_name,
          sizeTemplates,
          productTypes,
          autoDetectColours: s.auto_detect_colours,
          requireNoteForCorrections: s.require_note_for_corrections,
          maxPhotoMb: s.max_photo_mb,
          staff,
        },
        threshold: s.low_stock_threshold,
        catalogues: need(check(catalogues)).map(catalogueFromRow),
        images,
      };
    },

    // ── Products ──
    async createProduct(product: Product) {
      check(
        await supabase.from("products").insert({
          id: product.id,
          name: product.name,
          category: product.category,
          whatsapp_catalog_url: whatsappCatalogUrlColumn(product.whatsappCatalogUrl),
        }),
      );
      if (product.sizes.length) {
        check(
          await supabase
            .from("product_sizes")
            .insert(product.sizes.map((label, i) => ({ product_id: product.id, label, sort_order: i }))),
        );
      }
    },
    async updateProduct(id: string, patch: ProductPatch) {
      const { costCents, priceCents, whatsappCatalogUrl, ...fields } = patch;
      const update = {
        ...fields,
        ...(priceCents !== undefined && { default_price_cents: priceCents }),
        ...(whatsappCatalogUrl !== undefined && { whatsapp_catalog_url: whatsappCatalogUrlColumn(whatsappCatalogUrl) }),
      };
      if (Object.keys(update).length) check(await supabase.from("products").update(update).eq("id", id));
      if (costCents !== undefined) {
        check(await supabase.from("product_costs").update({ default_cost_cents: costCents }).eq("product_id", id));
      }
    },
    async setCategory(id: string, category: Category) {
      check(await supabase.rpc("set_product_category", { p_product_id: id, p_category: category }));
    },
    /** Archives instead when the product has stock history. Deletes its photo files only on a real delete. */
    async deleteProduct(id: string, photoIds: string[]) {
      const outcome = check(await supabase.rpc("delete_or_archive_product", { p_product_id: id }));
      if (outcome === "deleted" && photoIds.length) {
        await supabase.storage.from(PHOTO_BUCKET).remove(photoIds.flatMap((ph) => photoFiles(id, ph)));
      }
      return outcome as "deleted" | "archived";
    },

    // ── Stock ──
    async adjustStock(m: StockMovement, expectedBefore?: number) {
      check(
        await supabase.rpc("adjust_stock", {
          p_movement_id: m.id,
          p_variant_id: m.variantId,
          p_size_label: m.size,
          p_delta: m.delta,
          p_reason: m.reason,
          p_note: m.note,
          ...(expectedBefore !== undefined && { p_expected_before: expectedBefore }),
        }),
      );
    },

    // ── Variants & sizes ──
    async insertVariant(productId: string, v: Variant, sortOrder: number) {
      check(
        await supabase.from("product_variants").insert({
          id: v.id,
          product_id: productId,
          colour_name: v.colourName,
          colour_hex: v.colourHex,
          colour_status: v.colourStatus,
          style_label: v.style,
          sort_order: sortOrder,
        }),
      );
    },
    async updateVariant(
      id: string,
      patch: { colourName?: string; colourHex?: string; style?: string; colourStatus?: ColourStatus },
    ) {
      check(
        await supabase
          .from("product_variants")
          .update({
            ...(patch.colourName !== undefined && { colour_name: patch.colourName }),
            ...(patch.colourHex !== undefined && { colour_hex: patch.colourHex }),
            ...(patch.style !== undefined && { style_label: patch.style }),
            ...(patch.colourStatus !== undefined && { colour_status: patch.colourStatus }),
          })
          .eq("id", id),
      );
    },
    async removeVariant(variantId: string, fallbackVariantId: string | undefined) {
      if (fallbackVariantId) {
        check(await supabase.from("product_images").update({ variant_id: fallbackVariantId }).eq("variant_id", variantId));
      }
      check(await supabase.from("product_variants").delete().eq("id", variantId));
    },
    async addSize(productId: string, label: string, sortOrder: number) {
      check(await supabase.from("product_sizes").insert({ product_id: productId, label, sort_order: sortOrder }));
    },
    async removeSize(productId: string, label: string) {
      check(await supabase.from("product_sizes").delete().eq("product_id", productId).eq("label", label));
    },

    // ── Photos ──
    async uploadPhoto(productId: string, photo: Photo, dataUrl: string, sortOrder: number) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = photoPath(productId, photo.id);
      check(await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true }));
      check(
        await supabase.from("product_images").insert({
          id: photo.id,
          product_id: productId,
          variant_id: photo.variantId || null,
          storage_path: path,
          detected_hex: photo.hex,
          sort_order: sortOrder,
          mime_type: "image/jpeg",
          file_size: blob.size,
        }),
      );
    },
    async replacePhotoFile(productId: string, photoId: string, dataUrl: string) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = photoPath(productId, photoId);
      check(await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true }));
      check(await supabase.from("product_images").update({ file_size: blob.size }).eq("id", photoId));
    },
    /** Store a background-removed copy beside the original (never replacing it). */
    async saveCutout(productId: string, photoId: string, dataUrl: string, shown: boolean) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = cutoutPath(productId, photoId);
      check(await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/png", upsert: true }));
      check(await supabase.from("product_images").update({ cutout_path: path, show_cutout: shown }).eq("id", photoId));
    },
    /**
     * Save a hand refinement of the cutout (which stays untouched as its base).
     * Files first and the row last, so a failed save never points the photo at
     * files that weren't written.
     */
    async saveRefinement(productId: string, photoId: string, refinedDataUrl: string, maskDataUrl: string) {
      const [refined, mask] = await Promise.all([refinedDataUrl, maskDataUrl].map(async (url) => (await fetch(url)).blob()));
      const paths = { refined: refinedPath(productId, photoId), mask: maskPath(productId, photoId) };
      const bucket = supabase.storage.from(PHOTO_BUCKET);
      check(await bucket.upload(paths.mask, mask, { contentType: "image/png", upsert: true }));
      check(await bucket.upload(paths.refined, refined, { contentType: "image/png", upsert: true }));
      check(
        await supabase
          .from("product_images")
          .update({ refined_path: paths.refined, mask_path: paths.mask })
          .eq("id", photoId),
      );
    },
    /** Drop a refinement (and its enhanced copy), back to the plain cutout. */
    async clearRefinement(productId: string, photoId: string) {
      check(
        await supabase
          .from("product_images")
          .update({ refined_path: null, mask_path: null, refined_enhanced_path: null })
          .eq("id", photoId),
      );
      await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([refinedPath(productId, photoId), maskPath(productId, photoId), enhancedPath(productId, photoId, "refined")]);
    },
    /** Switching between original and background-removed starts unenhanced (enhancing is always asked for). */
    async setCutoutShown(photoId: string, shown: boolean) {
      check(await supabase.from("product_images").update({ show_cutout: shown, show_enhanced: false }).eq("id", photoId));
    },
    /** Store the enhanced copy of one version beside it (the version itself is never replaced). */
    async saveEnhanced(productId: string, photoId: string, version: PhotoVersion, dataUrl: string) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = enhancedPath(productId, photoId, version);
      const contentType = version === "original" ? "image/jpeg" : "image/png";
      check(await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType, upsert: true }));
      check(await supabase.from("product_images").update(enhancedColumn(version, path)).eq("id", photoId));
    },
    async clearEnhanced(productId: string, photoId: string, version: PhotoVersion) {
      check(await supabase.from("product_images").update(enhancedColumn(version, null)).eq("id", photoId));
      await supabase.storage.from(PHOTO_BUCKET).remove([enhancedPath(productId, photoId, version)]);
    },
    async setEnhancedShown(photoId: string, shown: boolean) {
      check(await supabase.from("product_images").update({ show_enhanced: shown }).eq("id", photoId));
    },
    /** Accepted AI results live in Cloudinary; only the durable URL and active choice live in Supabase. */
    async saveIroned(_productId: string, photoId: string, dataUrl: string) {
      const response = await fetch("/api/iron-clothes/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Couldn't save the ironed photo.");
      check(await supabase.from("product_images").update({ ironed_path: body.url, show_ironed: true }).eq("id", photoId));
      return body.url;
    },
    async setIronedShown(photoId: string, shown: boolean) {
      check(await supabase.from("product_images").update({ show_ironed: shown }).eq("id", photoId));
    },
    async assignPhoto(photoId: string, variantId: string) {
      check(await supabase.from("product_images").update({ variant_id: variantId }).eq("id", photoId));
    },
    async reorderPhotos(photoIds: string[]) {
      const results = await Promise.all(
        photoIds.map((id, i) => supabase.from("product_images").update({ sort_order: i }).eq("id", id)),
      );
      results.forEach(check);
    },
    async removePhoto(productId: string, photoId: string, dropVariantId?: string) {
      check(await supabase.from("product_images").delete().eq("id", photoId));
      await supabase.storage.from(PHOTO_BUCKET).remove(photoFiles(productId, photoId));
      if (dropVariantId) check(await supabase.from("product_variants").delete().eq("id", dropVariantId));
    },

    // ── Settings (owner only; the database rejects others) ──
    async saveSettings(s: {
      shopName: string;
      threshold: number;
      autoDetectColours: boolean;
      requireNoteForCorrections: boolean;
      maxPhotoMb: number;
    }) {
      check(
        await supabase
          .from("shop_settings")
          .update({
            shop_name: s.shopName,
            low_stock_threshold: s.threshold,
            auto_detect_colours: s.autoDetectColours,
            require_note_for_corrections: s.requireNoteForCorrections,
            max_photo_mb: s.maxPhotoMb,
          })
          .eq("id", true),
      );
    },
    async saveSizeTemplate(category: Category, sizes: string[]) {
      check(await supabase.from("size_templates").upsert({ category, sizes, updated_at: new Date().toISOString() }));
    },
    async saveProductTypes(category: Category, types: string[]) {
      check(await supabase.from("product_types").delete().eq("category", category));
      if (types.length) {
        check(await supabase.from("product_types").insert(types.map((name, i) => ({ category, name, sort_order: i }))));
      }
    },

    // ── Catalogues ──
    async createCatalogue(c: Catalogue) {
      check(await supabase.from("catalogues").insert({ id: c.id, ...catalogueColumns(c) }));
    },
    async updateCatalogue(id: string, patch: Partial<Omit<Catalogue, "id">>) {
      check(await supabase.from("catalogues").update(catalogueColumns(patch)).eq("id", id));
    },
    async deleteCatalogue(id: string) {
      check(await supabase.from("catalogues").delete().eq("id", id));
    },

    // ── Staff ──
    async inviteStaff(name: string, email: string) {
      check(await supabase.from("staff_invites").insert({ name: name.trim(), email: email.trim().toLowerCase() }));
    },
    async updateStaff(member: StaffMember) {
      if (member.status === "invited") {
        check(
          await supabase
            .from("staff_invites")
            .update({ can_view_costs: member.canViewCosts, can_edit_prices: member.canEditPrices })
            .eq("email", member.email),
        );
        return;
      }
      check(
        await supabase
          .from("profiles")
          .update({
            role: member.role === "Owner" ? "owner" : member.status === "pending" ? "pending" : "staff",
            can_view_costs: member.canViewCosts,
            can_edit_prices: member.canEditPrices,
          })
          .eq("id", member.id),
      );
    },
    /** Invites are deleted; accounts lose access (role back to pending) — the login itself stays. */
    async removeStaff(member: StaffMember) {
      if (member.status === "invited") {
        check(await supabase.from("staff_invites").delete().eq("email", member.email));
        return;
      }
      check(
        await supabase
          .from("profiles")
          .update({ role: "pending", can_view_costs: false, can_edit_prices: false })
          .eq("id", member.id),
      );
    },
  };
}

export type SupabaseInventory = ReturnType<typeof createSupabaseInventory>;
