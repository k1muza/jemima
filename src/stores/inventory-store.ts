import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import type { SupabaseInventory } from "@/lib/backend/supabase-inventory";
import { newCatalogue } from "@/lib/catalogue/model";
import { attachPhoto, nameColour, newVariant } from "@/lib/inventory/colour";
import {
  currentVersion,
  cutoutKey,
  enhancedKey,
  ironedKey,
  maskKey,
  photoKeys,
  refinedKey,
  requestCutout,
  requestEnhanced,
  requestIroned,
  versionKey,
  type PhotoVersion,
} from "@/lib/inventory/cutout";
import { photoDb } from "@/lib/inventory/photo-db";
import { withAlphaOf } from "@/lib/inventory/pixels";
import { seedMovements, seedProducts, seedSettings } from "@/lib/inventory/seed";
import { isEmptyProduct, qtyOf, variantUnits } from "@/lib/inventory/stock";
import {
  FULL_ACCESS,
  reasonLabel,
  type Access,
  type Catalogue,
  type Category,
  type MovementReason,
  type Photo,
  type Product,
  type ProductPatch,
  type ShopSettings,
  type StaffMember,
  type StockMovement,
  type Variant,
} from "@/lib/inventory/types";

export type CatalogueFilter = "All" | "Clothing" | "Shoes" | "Low stock" | "Needs details";
export type CatalogueLayout = "Grid" | "List";
export type CatalogueSort = "Newest" | "Name" | "Most units" | "Cost" | "Retail price" | "Last updated";

export type AdjustResult = { ok: true; movement: StockMovement } | { ok: false; error: string };
export type CutoutResult = { ok: true } | { ok: false; error: string };
export type IronResult = { ok: true; image: string } | { ok: false; error: string };
/** A hand refinement of a cutout, as PNG data URLs. */
export type Refinement = { refined: string; mask: string };
/** New bytes for a photo's other versions (e.g. after rotating it). */
export type PhotoVersions = { cutout?: string; enhanced?: Partial<Record<PhotoVersion, string>> } & Partial<Refinement>;

/** demo: seeded data kept in this browser. supabase: the shared database. */
export type InventoryMode = "demo" | "supabase";

export type InventoryState = {
  mode: InventoryMode;
  /** True once data has loaded (from browser storage or Supabase). Render skeletons until then. */
  ready: boolean;
  loadError: string | null;
  access: Access;
  products: Product[];
  /** Shop-wide low-stock threshold, per size. */
  threshold: number;
  layout: CatalogueLayout;
  filter: CatalogueFilter;
  search: string;
  sort: CatalogueSort;
  /** Append-only stock history, newest first. */
  movements: StockMovement[];
  settings: ShopSettings;
  /** Name recorded on stock movements (the signed-in user). */
  actor: string;
  /**
   * Photo id → displayable URL (data URL, or a signed Supabase Storage URL). Also holds
   * each photo's other versions under `cutoutKey(id)`, `refinedKey(id)`, `maskKey(id)` and
   * `enhancedKey(id, version)`.
   */
  images: Record<string, string>;
  /** Full file URL (a value of `images`) → its small copy, for lists. Use with `thumbSrc`. */
  thumbs: Record<string, string>;
  /** Photos currently being processed for colour detection. */
  busy: number;
  /** Photo ids whose background is being removed. */
  cutoutPending: Record<string, true>;
  /** Photo ids being enhanced. */
  enhancePending: Record<string, true>;
  /** Photo ids currently being sent to the manually triggered Gemini edit. */
  ironPending: Record<string, true>;
  /** Customer-facing catalogues (PDF / web page), oldest first. */
  catalogues: Catalogue[];
  /** The catalogue open in the editor (falls back to the first). */
  activeCatalogueId: string | null;
};

export type InventoryActions = {
  /** Load (or reload) everything from Supabase. No-op in demo mode. */
  load: () => Promise<void>;
  /** Send any batched edits now (e.g. before leaving the page). */
  flushPending: () => Promise<void>;
  hasPending: () => boolean;

  createProduct: () => string;
  updateProduct: (id: string, patch: ProductPatch) => void;
  setCategory: (id: string, category: Category) => void;
  deleteProduct: (id: string) => void;
  /** Put back a snapshot taken before an edit (for Undo). */
  restoreProduct: (product: Product) => void;
  pruneEmptyProducts: () => void;

  /** Direct typing in a stock grid; recorded as a correction (rapid edits to one size coalesce). */
  setQty: (productId: string, variantId: string, size: string, qty: number | null) => void;
  /** Add/remove stock with a reason. Rejects a negative result. */
  adjustStock: (
    productId: string,
    variantId: string,
    size: string,
    delta: number,
    reason: MovementReason,
    note?: string,
  ) => AdjustResult;
  /** Record the opposite movement (history is never edited). */
  reverseMovement: (movementId: string) => AdjustResult;
  updateVariant: (
    productId: string,
    variantId: string,
    patch: Partial<Pick<Variant, "colourName" | "colourHex" | "style">>,
  ) => void;
  addPlainVariant: (productId: string) => void;
  removeVariant: (productId: string, variantId: string) => void;
  addSize: (productId: string, size: string) => boolean;
  removeSize: (productId: string, size: string) => void;

  addPhoto: (productId: string, dataUrl: string, hex: string) => void;
  assignPhoto: (productId: string, photoId: string, variantId: string | "own") => void;
  makeCover: (productId: string, photoId: string) => void;
  /** Swap in rotated image bytes for a photo (and its other versions, if any). */
  replacePhotoImage: (productId: string, photoId: string, dataUrl: string, versions?: PhotoVersions) => void;
  /**
   * Show the photo without its background. Cloudinary processes it only the first
   * time; after that the stored copy is reused. The original is never replaced.
   */
  removeBackground: (productId: string, photoId: string) => Promise<CutoutResult>;
  /** Show the untouched original photo again (instant: no Cloudinary call). */
  restoreOriginal: (productId: string, photoId: string) => void;
  /**
   * Make sure an enhanced copy of the photo's current version exists, so it can be
   * previewed. Cloudinary processes each version once; after that the stored copy
   * is reused. Nothing is shown until `setEnhanced` saves the choice.
   */
  enhance: (productId: string, photoId: string) => Promise<CutoutResult>;
  /** Save whether the photo shows its enhanced copy (instant: no Cloudinary call). */
  setEnhanced: (productId: string, photoId: string, enhanced: boolean) => void;
  /** Generate or reuse an ironed preview without changing the active photo. */
  ironClothes: (productId: string, photoId: string) => Promise<IronResult>;
  /** Persist a preview, then make it active. A failed save leaves the previous image untouched. */
  acceptIroned: (productId: string, photoId: string, image: string) => Promise<CutoutResult>;
  /** Switch between the saved ironed result and the prior version without regenerating. */
  setIroned: (productId: string, photoId: string, shown: boolean) => void;
  /**
   * Store a hand refinement of a photo's cutout, or `null` to drop it (back to the
   * plain cutout). The cutout and original are never changed. Resolves once saved;
   * rejects when saving fails, leaving the previous version in place.
   */
  saveRefinement: (productId: string, photoId: string, refinement: Refinement | null) => Promise<void>;
  removePhoto: (productId: string, photoId: string) => void;
  setImages: (images: Record<string, string>) => void;
  setBusy: (delta: number) => void;

  setLayout: (layout: CatalogueLayout) => void;
  setFilter: (filter: CatalogueFilter) => void;
  setSearch: (search: string) => void;
  setSort: (sort: CatalogueSort) => void;

  /** Create a catalogue (opened in the editor); returns its id. */
  createCatalogue: (init?: Partial<Catalogue>) => string;
  /** Make sure at least one catalogue exists (the first visit creates "All pieces"). */
  ensureCatalogue: () => void;
  updateCatalogue: (id: string, patch: Partial<Omit<Catalogue, "id">>) => void;
  deleteCatalogue: (id: string) => void;
  setActiveCatalogue: (id: string) => void;

  setThreshold: (threshold: number) => void;
  updateSettings: (patch: Partial<Omit<ShopSettings, "staff">>) => void;
  updateStaff: (id: string, patch: Partial<Omit<StaffMember, "id">>) => void;
  inviteStaff: (name: string, email: string) => void;
  removeStaff: (id: string) => void;
  setActor: (actor: string) => void;
  resetDemo: () => void;
};

export type InventoryStore = InventoryState & InventoryActions;

export type InventoryStoreOptions = {
  mode: InventoryMode;
  backend?: SupabaseInventory;
  /** Shown when a save fails (the latest data is then reloaded). */
  onError?: (message: string) => void;
};

const newId = () => crypto.randomUUID();

/** Demo: typed grid edits to one size within this window merge into one movement. */
const DEMO_COALESCE_MS = 15_000;
/** Supabase: pause after typing before a batched edit is saved. */
const TYPING_DEBOUNCE_MS = 700;
/** Removals that offer Undo are saved after the toast has had time to be used. */
const UNDO_WINDOW_MS = 6_500;
/** Older photos' thumbnails are made after the page's own photos have had time to load. */
const THUMB_BACKFILL_DELAY_MS = 5_000;
const MAX_MOVEMENTS = 2000;

function blankProduct(sizes: string[]): Product {
  return {
    id: newId(),
    name: "",
    category: "Clothing",
    type: "",
    sku: "",
    costCents: 0,
    priceCents: 0,
    sizes: sizes.slice(),
    variants: [],
    photos: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createInventoryStore({ mode, backend, onError }: InventoryStoreOptions) {
  const sync = mode === "supabase" ? backend : undefined;
  const demo = mode === "demo";
  let backfillStarted = false;

  return createStore<InventoryStore>()(
    persist(
      (set, get) => {
        // ───────────── Local updates ─────────────
        /** Immutable update of one product; stamps updatedAt. */
        const edit = (id: string, fn: (p: Product) => Product) =>
          set((s) => ({
            products: s.products.map((p) => (p.id === id ? { ...fn(p), updatedAt: new Date().toISOString() } : p)),
          }));
        const editVariant = (productId: string, variantId: string, fn: (v: Variant) => Variant) =>
          edit(productId, (p) => ({
            ...p,
            variants: p.variants.map((v) => (v.id === variantId ? fn(v) : v)),
          }));
        const findProduct = (id: string) => get().products.find((p) => p.id === id);
        const findVariant = (productId: string, variantId: string) =>
          findProduct(productId)?.variants.find((v) => v.id === variantId);
        const record = (movement: Omit<StockMovement, "id" | "actor" | "at">) => {
          const full: StockMovement = { ...movement, id: newId(), actor: get().actor, at: new Date().toISOString() };
          set((s) => ({ movements: [full, ...s.movements].slice(0, MAX_MOVEMENTS) }));
          return full;
        };
        let lastGridEdit: { key: string; movementId: string; at: number } | null = null;
        const editPhoto = (productId: string, photoId: string, fn: (ph: Photo) => Photo) =>
          edit(productId, (p) => ({ ...p, photos: p.photos.map((ph) => (ph.id === photoId ? fn(ph) : ph)) }));
        /** Background removals in flight, so a repeated click joins the same request. */
        const cutoutRequests = new Map<string, Promise<CutoutResult>>();
        /** Enhancements in flight, by the file they produce. */
        const enhanceRequests = new Map<string, Promise<CutoutResult>>();
        /** AI ironing in flight, keyed by photo, so repeated clicks never create paid duplicates. */
        const ironRequests = new Map<string, Promise<IronResult>>();
        /** Storing a photo's enhanced copies (and their files' keys in `images`). */
        const keepEnhanced = (productId: string, photoId: string, files: Partial<Record<PhotoVersion, string>>) => {
          const entries = (Object.entries(files) as [PhotoVersion, string | undefined][]).filter((e): e is [PhotoVersion, string] => !!e[1]);
          if (!entries.length) return;
          set((s) => ({ images: { ...s.images, ...Object.fromEntries(entries.map(([v, url]) => [enhancedKey(photoId, v), url])) } }));
          if (demo) entries.forEach(([v, url]) => photoDb.put(enhancedKey(photoId, v), url));
          enqueue(productId, async () => {
            for (const [v, url] of entries) await sync!.saveEnhanced(productId, photoId, v, url);
          });
        };

        // ───────────── Saving to Supabase ─────────────
        // Saves for one product (or "settings"/"staff") run in order; a failure shows an
        // error and reloads, so the screen never silently disagrees with the database.
        const chains = new Map<string, Promise<void>>();
        const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; queue: string; run: () => Promise<void> }>();
        let reloadScheduled = false;

        const fail = (error: unknown) => {
          onError?.(error instanceof Error ? error.message : "Couldn't save that change.");
          if (reloadScheduled) return;
          reloadScheduled = true;
          setTimeout(async () => {
            await Promise.allSettled(chains.values());
            reloadScheduled = false;
            get().load();
          }, 300);
        };
        const enqueue = (queue: string, task: () => Promise<void>) => {
          if (!sync) return;
          const next = (chains.get(queue) ?? Promise.resolve()).then(task).catch(fail);
          chains.set(queue, next);
          next.finally(() => chains.get(queue) === next && chains.delete(queue));
        };
        /** Like `enqueue`, but returns the save so the caller can handle a failure itself (no reload). */
        const enqueueAwait = <T,>(queue: string, task: () => Promise<T>) => {
          const result = (chains.get(queue) ?? Promise.resolve()).then(task);
          const next = result.then(() => {}, () => {});
          chains.set(queue, next);
          next.finally(() => chains.get(queue) === next && chains.delete(queue));
          return result;
        };
        /** Run `task` after `ms` of quiet for `key` (restarted by each call). */
        const later = (key: string, queue: string, ms: number, task: () => Promise<void>) => {
          if (!sync) return;
          const existing = timers.get(key);
          if (existing) clearTimeout(existing.timer);
          const timer = setTimeout(() => {
            timers.delete(key);
            enqueue(queue, task);
          }, ms);
          timers.set(key, { timer, queue, run: task });
        };
        const flushKey = (key: string) => {
          const pending = timers.get(key);
          if (!pending) return;
          clearTimeout(pending.timer);
          timers.delete(key);
          enqueue(pending.queue, pending.run);
        };
        const cancelKeys = (match: (key: string) => boolean) => {
          for (const [key, pending] of timers) {
            if (match(key)) {
              clearTimeout(pending.timer);
              timers.delete(key);
            }
          }
        };

        const productPatches = new Map<string, ProductPatch>();
        const variantPatches = new Map<
          string,
          { colourName?: string; colourHex?: string; style?: string; colourStatus?: Variant["colourStatus"] }
        >();
        const cataloguePatches = new Map<string, Partial<Omit<Catalogue, "id">>>();
        let settingsDirty = false;

        const saveSettingsLater = () => {
          settingsDirty = true;
          later("settings", "settings", TYPING_DEBOUNCE_MS, async () => {
            if (!settingsDirty) return;
            settingsDirty = false;
            const { settings, threshold } = get();
            await sync!.saveSettings({ ...settings, threshold });
          });
        };

        const products = demo ? seedProducts() : [];
        return {
          mode,
          ready: false,
          loadError: null,
          access: FULL_ACCESS,
          products,
          threshold: 3,
          layout: "Grid",
          filter: "All",
          search: "",
          sort: "Newest",
          movements: demo ? seedMovements(products) : [],
          settings: seedSettings(),
          actor: "Jemima",
          images: {},
          busy: 0,
          cutoutPending: {},
          enhancePending: {},
          ironPending: {},
          catalogues: [],
          activeCatalogueId: null,
          thumbs: {},

          load: async () => {
            if (!sync) return;
            try {
              const { missingThumbs, ...snapshot } = await sync.load();
              set((s) => ({
                ...snapshot,
                // Keep local previews of photos still uploading.
                images: { ...s.images, ...snapshot.images },
                ready: true,
                loadError: null,
              }));
              // Older photos get thumbnails once, in the background, after the page has loaded its photos.
              if (missingThumbs.length && !backfillStarted) {
                backfillStarted = true;
                setTimeout(() => void sync.backfillThumbnails(missingThumbs), THUMB_BACKFILL_DELAY_MS);
              }
            } catch (error) {
              set({ ready: true, loadError: error instanceof Error ? error.message : "Couldn't load the inventory." });
            }
          },
          flushPending: async () => {
            for (const key of [...timers.keys()]) flushKey(key);
            await Promise.allSettled(chains.values());
          },
          hasPending: () => timers.size > 0 || chains.size > 0,

          createProduct: () => {
            const product = blankProduct(get().settings.sizeTemplates.Clothing);
            set((s) => ({ products: [product, ...s.products] }));
            enqueue(product.id, () => sync!.createProduct(product));
            return product.id;
          },
          updateProduct: (id, patch) => {
            edit(id, (p) => ({ ...p, ...patch }));
            productPatches.set(id, { ...productPatches.get(id), ...patch });
            later(`product:${id}`, id, TYPING_DEBOUNCE_MS, async () => {
              const pending = productPatches.get(id);
              productPatches.delete(id);
              if (pending) await sync!.updateProduct(id, pending);
            });
          },
          setCategory: (id, category) => {
            const current = findProduct(id);
            if (!current || current.category === category) return;
            const sizes = get().settings.sizeTemplates[category].slice();
            edit(id, (p) => ({
              ...p,
              category,
              sizes,
              variants: p.variants.map((v) => ({
                ...v,
                qty: Object.fromEntries(sizes.map((z) => [z, v.qty[z] ?? 0])),
              })),
            }));
            flushKey(`product:${id}`);
            enqueue(id, () => sync!.setCategory(id, category));
          },
          deleteProduct: (id) => {
            const product = findProduct(id);
            if (!product) return;
            if (demo) product.photos.forEach((ph) => photoKeys(ph.id).forEach((key) => photoDb.remove(key)));
            set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
            cancelKeys((key) => key.endsWith(id) || key.startsWith(`qty:${id}|`) || key.startsWith(`undoable:${id}:`));
            productPatches.delete(id);
            enqueue(id, async () => {
              await sync!.deleteProduct(
                id,
                product.photos.map((ph) => ph.id),
              );
            });
          },
          restoreProduct: (product) => {
            if (demo) {
              product.photos.forEach((ph) => {
                for (const key of photoKeys(ph.id)) {
                  const dataUrl = get().images[key];
                  if (dataUrl) photoDb.put(key, dataUrl);
                }
              });
            }
            // Undo within the window: the removal was never sent.
            cancelKeys((key) => key.startsWith(`undoable:${product.id}:`));
            set((s) => ({
              products: s.products.some((p) => p.id === product.id)
                ? s.products.map((p) => (p.id === product.id ? product : p))
                : [product, ...s.products],
            }));
          },
          pruneEmptyProducts: () => {
            const empty = get().products.filter(isEmptyProduct);
            if (!empty.length) return;
            set((s) => ({ products: s.products.filter((p) => !isEmptyProduct(p)) }));
            for (const p of empty) {
              cancelKeys((key) => key.endsWith(p.id));
              enqueue(p.id, async () => {
                await sync!.deleteProduct(p.id, []);
              });
            }
          },

          setQty: (productId, variantId, size, qty) => {
            const variant = findVariant(productId, variantId);
            if (!variant) return;
            const before = qtyOf(variant, size);
            const stored = qty == null ? null : Math.max(0, Math.floor(qty));
            const after = stored ?? 0;
            editVariant(productId, variantId, (v) => ({ ...v, qty: { ...v.qty, [size]: stored } }));

            const key = `${productId}|${variantId}|${size}`;
            const now = Date.now();
            const previous = lastGridEdit;
            const inProgress =
              previous && previous.key === key && (sync ? timers.has(`qty:${key}`) : now - previous.at < DEMO_COALESCE_MS);
            if (inProgress && previous) {
              // Same edit still in progress (typing "1" then "12"): extend its movement.
              lastGridEdit = { ...previous, at: now };
              set((s) => ({
                movements: s.movements
                  .map((m) =>
                    m.id === previous.movementId ? { ...m, after, delta: after - m.before, at: new Date(now).toISOString() } : m,
                  )
                  .filter((m) => m.delta !== 0),
              }));
            } else {
              if (after === before) return;
              const movement = record({
                productId,
                variantId,
                size,
                delta: after - before,
                before,
                after,
                reason: "correction",
                note: "Edited in stock grid",
              });
              lastGridEdit = { key, movementId: movement.id, at: now };
            }

            const movementId = lastGridEdit!.movementId;
            later(`qty:${key}`, productId, TYPING_DEBOUNCE_MS, async () => {
              if (lastGridEdit?.movementId === movementId) lastGridEdit = null;
              const movement = get().movements.find((m) => m.id === movementId);
              if (!movement) return; // typed back to the original number
              // Expected-before guards against overwriting someone else's change.
              await sync!.adjustStock(movement, movement.before);
            });
          },
          adjustStock: (productId, variantId, size, delta, reason, note = "") => {
            const variant = findVariant(productId, variantId);
            if (!variant) return { ok: false, error: "That item no longer exists." };
            if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "Enter a whole number other than 0." };
            const before = qtyOf(variant, size);
            const after = before + delta;
            if (after < 0) return { ok: false, error: `Only ${before} in stock, so you can remove at most ${before}.` };
            // A typed edit to the same size must reach the server first.
            flushKey(`qty:${productId}|${variantId}|${size}`);
            lastGridEdit = null;
            editVariant(productId, variantId, (v) => ({ ...v, qty: { ...v.qty, [size]: after } }));
            const movement = record({ productId, variantId, size, delta, before, after, reason, note: note.trim() });
            enqueue(productId, () => sync!.adjustStock(movement));
            return { ok: true, movement };
          },
          reverseMovement: (movementId) => {
            const m = get().movements.find((x) => x.id === movementId);
            if (!m) return { ok: false, error: "That change is no longer in the history." };
            const signed = `${m.delta > 0 ? "+" : ""}${m.delta}`;
            return get().adjustStock(
              m.productId,
              m.variantId,
              m.size,
              -m.delta,
              "correction",
              `Reversal of ${reasonLabel(m.reason).toLowerCase()} (${signed})`,
            );
          },
          updateVariant: (productId, variantId, patch) => {
            // A user-picked colour or typed name is a correction: detection must not overwrite it.
            const colourStatus = patch.colourName !== undefined || patch.colourHex !== undefined ? ("corrected" as const) : undefined;
            editVariant(productId, variantId, (v) => ({ ...v, ...patch, colourStatus: colourStatus ?? v.colourStatus }));
            variantPatches.set(variantId, { ...variantPatches.get(variantId), ...patch, ...(colourStatus && { colourStatus }) });
            later(`variant:${variantId}:${productId}`, productId, TYPING_DEBOUNCE_MS, async () => {
              const pending = variantPatches.get(variantId);
              variantPatches.delete(variantId);
              if (pending) await sync!.updateVariant(variantId, pending);
            });
          },
          addPlainVariant: (productId) => {
            const product = findProduct(productId);
            if (!product) return;
            const variant: Variant = {
              ...newVariant(product.sizes, newId(), "One colour", "#9a948a"),
              colourStatus: "corrected",
            };
            edit(productId, (p) => ({ ...p, variants: [...p.variants, variant] }));
            enqueue(productId, () => sync!.insertVariant(productId, variant, product.variants.length));
          },
          removeVariant: (productId, variantId) => {
            const product = findProduct(productId);
            if (!product) return;
            const fallback = product.variants.find((v) => v.id !== variantId)?.id;
            edit(productId, (p) => ({
              ...p,
              variants: p.variants.filter((v) => v.id !== variantId),
              photos: fallback
                ? p.photos.map((ph) => (ph.variantId === variantId ? { ...ph, variantId: fallback } : ph))
                : p.photos,
            }));
            flushKey(`variant:${variantId}:${productId}`);
            later(`undoable:${productId}:variant:${variantId}`, productId, UNDO_WINDOW_MS, () =>
              sync!.removeVariant(variantId, fallback),
            );
          },
          addSize: (productId, raw) => {
            const size = raw.trim().toUpperCase();
            const product = findProduct(productId);
            if (!size || !product || product.sizes.some((z) => z.toUpperCase() === size)) return false;
            edit(productId, (p) => ({
              ...p,
              sizes: [...p.sizes, size],
              variants: p.variants.map((v) => ({ ...v, qty: { ...v.qty, [size]: 0 } })),
            }));
            enqueue(productId, () => sync!.addSize(productId, size, product.sizes.length));
            return true;
          },
          removeSize: (productId, size) => {
            edit(productId, (p) => ({
              ...p,
              sizes: p.sizes.filter((z) => z !== size),
              variants: p.variants.map((v) => {
                const qty = { ...v.qty };
                delete qty[size];
                return { ...v, qty };
              }),
            }));
            later(`undoable:${productId}:size:${size}`, productId, UNDO_WINDOW_MS, () => sync!.removeSize(productId, size));
          },

          addPhoto: (productId, dataUrl, hex) => {
            const photoId = newId();
            if (demo) photoDb.put(photoId, dataUrl);
            set((s) => ({ images: { ...s.images, [photoId]: dataUrl } }));
            const before = findProduct(productId);
            if (!before) return;
            if (get().settings.autoDetectColours) {
              edit(productId, (p) => attachPhoto(p, photoId, hex, newId));
            } else {
              // Detection off: join the first row, or start an unnamed one.
              edit(productId, (p) => {
                const variants = p.variants.length
                  ? p.variants
                  : [{ ...newVariant(p.sizes, newId(), "Unspecified", "#9a948a"), colourStatus: "unavailable" as const }];
                return { ...p, variants, photos: [...p.photos, { id: photoId, variantId: variants[0].id, hex }] };
              });
            }
            const after = findProduct(productId)!;
            const photo = after.photos.find((ph) => ph.id === photoId)!;
            const created = after.variants.filter((v) => !before.variants.some((b) => b.id === v.id));
            enqueue(productId, async () => {
              for (const v of created) await sync!.insertVariant(productId, v, after.variants.indexOf(v));
              await sync!.uploadPhoto(productId, photo, dataUrl, after.photos.indexOf(photo));
            });
          },
          assignPhoto: (productId, photoId, variantId) => {
            const product = findProduct(productId);
            const photo = product?.photos.find((ph) => ph.id === photoId);
            if (!product || !photo) return;
            const previous = product.variants.find((v) => v.id === photo.variantId);
            const othersInPrevious = product.photos.some((ph) => ph.id !== photoId && ph.variantId === photo.variantId);
            // Already there, or already alone in its own row: nothing to do.
            if (variantId === photo.variantId || (variantId === "own" && previous && !othersInPrevious)) return;
            let created: Variant | null = null;
            let target = variantId;
            if (target === "own") {
              created = newVariant(product.sizes, newId(), nameColour(photo.hex), photo.hex);
              target = created.id;
            }
            const assigned = target;
            // The row left behind goes too when it has no photos and no stock, as when its last photo is removed.
            const dropVariant = previous && !othersInPrevious && variantUnits(product, previous) === 0 ? previous : undefined;
            edit(productId, (p) => ({
              ...p,
              variants: [...p.variants, ...(created ? [created] : [])].filter((v) => v.id !== dropVariant?.id),
              photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, variantId: assigned } : ph)),
            }));
            if (dropVariant) flushKey(`variant:${dropVariant.id}:${productId}`);
            enqueue(productId, async () => {
              if (created) await sync!.insertVariant(productId, created, product.variants.length);
              await sync!.assignPhoto(photoId, assigned);
              if (dropVariant) await sync!.removeVariant(dropVariant.id, undefined);
            });
          },
          makeCover: (productId, photoId) => {
            edit(productId, (p) => {
              const photo = p.photos.find((ph) => ph.id === photoId);
              return photo ? { ...p, photos: [photo, ...p.photos.filter((ph) => ph.id !== photoId)] } : p;
            });
            const order = findProduct(productId)?.photos.map((ph) => ph.id) ?? [];
            enqueue(productId, () => sync!.reorderPhotos(order));
          },
          replacePhotoImage: (productId, photoId, dataUrl, { cutout, refined, mask, enhanced = {} } = {}) => {
            const shown = !!findProduct(productId)?.photos.find((ph) => ph.id === photoId)?.showCutout;
            const files: Record<string, string> = {
              [photoId]: dataUrl,
              ...(cutout && { [cutoutKey(photoId)]: cutout }),
              ...(refined && mask && { [refinedKey(photoId)]: refined, [maskKey(photoId)]: mask }),
            };
            set((s) => ({ images: { ...s.images, ...files } }));
            if (demo) Object.entries(files).forEach(([key, url]) => photoDb.put(key, url));
            enqueue(productId, async () => {
              await sync!.replacePhotoFile(productId, photoId, dataUrl);
              if (cutout) await sync!.saveCutout(productId, photoId, cutout, shown);
              if (refined && mask) await sync!.saveRefinement(productId, photoId, refined, mask);
            });
            keepEnhanced(productId, photoId, enhanced);
          },
          removeBackground: (productId, photoId) => {
            const photo = findProduct(productId)?.photos.find((ph) => ph.id === photoId);
            const original = get().images[photoId];
            if (!photo || !original) return Promise.resolve({ ok: false, error: "That photo is no longer here." });
            if (photo.hasCutout && get().images[cutoutKey(photoId)]) {
              // Already processed: switch back to the stored copy (not enhanced until asked again).
              if (!photo.showCutout) {
                editPhoto(productId, photoId, (ph) => ({ ...ph, showCutout: true, enhanced: false }));
                enqueue(productId, () => sync!.setCutoutShown(photoId, true));
              }
              return Promise.resolve({ ok: true });
            }
            const inFlight = cutoutRequests.get(photoId);
            if (inFlight) return inFlight;

            const run = async (): Promise<CutoutResult> => {
              set((s) => ({ cutoutPending: { ...s.cutoutPending, [photoId]: true } }));
              try {
                const cutout = await requestCutout(original);
                if (!findProduct(productId)?.photos.some((ph) => ph.id === photoId)) {
                  return { ok: false, error: "That photo was removed." };
                }
                if (get().images[photoId] !== original) {
                  return { ok: false, error: "The photo changed while its background was being removed. Try again." };
                }
                set((s) => ({ images: { ...s.images, [cutoutKey(photoId)]: cutout } }));
                if (demo) photoDb.put(cutoutKey(photoId), cutout);
                const wasEnhanced = !!findProduct(productId)?.photos.find((ph) => ph.id === photoId)?.enhanced;
                editPhoto(productId, photoId, (ph) => ({ ...ph, hasCutout: true, showCutout: true, enhanced: false }));
                enqueue(productId, async () => {
                  await sync!.saveCutout(productId, photoId, cutout, true);
                  if (wasEnhanced) await sync!.setEnhancedShown(photoId, false);
                });
                return { ok: true };
              } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : "Couldn't remove the background." };
              } finally {
                cutoutRequests.delete(photoId);
                set((s) => {
                  const cutoutPending = { ...s.cutoutPending };
                  delete cutoutPending[photoId];
                  return { cutoutPending };
                });
              }
            };
            const request = run();
            cutoutRequests.set(photoId, request);
            return request;
          },
          restoreOriginal: (productId, photoId) => {
            if (!findProduct(productId)?.photos.find((ph) => ph.id === photoId)?.showCutout) return;
            editPhoto(productId, photoId, (ph) => ({ ...ph, showCutout: false, enhanced: false }));
            enqueue(productId, () => sync!.setCutoutShown(photoId, false));
          },
          enhance: (productId, photoId) => {
            const photo = findProduct(productId)?.photos.find((ph) => ph.id === photoId);
            const images = get().images;
            if (!photo || !images[photoId]) return Promise.resolve({ ok: false, error: "That photo is no longer here." });
            const version = currentVersion(images, photo);
            const target = enhancedKey(photoId, version);
            // Already enhanced: reuse the stored copy.
            if (images[target]) return Promise.resolve({ ok: true });
            const inFlight = enhanceRequests.get(target);
            if (inFlight) return inFlight;

            const run = async (): Promise<CutoutResult> => {
              set((s) => ({ enhancePending: { ...s.enhancePending, [photoId]: true } }));
              const source = images[versionKey(photoId, version)];
              const cutout = images[cutoutKey(photoId)];
              try {
                const files: Partial<Record<PhotoVersion, string>> = {};
                if (version === "original") {
                  files.original = await requestEnhanced(source);
                } else {
                  // Enhance the cutout (the refinement's untouched base), keeping exactly its transparency.
                  const enhancedCutout =
                    images[enhancedKey(photoId, "cutout")] ?? (files.cutout = await withAlphaOf(await requestEnhanced(cutout), cutout));
                  // A refinement is the cutout with erased areas made transparent; erase the same from the enhanced cutout.
                  if (version === "refined") files.refined = await withAlphaOf(enhancedCutout, source);
                }
                const now = get();
                if (!findProduct(productId)?.photos.some((ph) => ph.id === photoId)) {
                  return { ok: false, error: "That photo was removed." };
                }
                if (now.images[versionKey(photoId, version)] !== source || (version !== "original" && now.images[cutoutKey(photoId)] !== cutout)) {
                  return { ok: false, error: "The photo changed while it was being enhanced. Try again." };
                }
                keepEnhanced(productId, photoId, files);
                return { ok: true };
              } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : "Couldn't enhance the photo." };
              } finally {
                enhanceRequests.delete(target);
                set((s) => {
                  const enhancePending = { ...s.enhancePending };
                  delete enhancePending[photoId];
                  return { enhancePending };
                });
              }
            };
            const request = run();
            enhanceRequests.set(target, request);
            return request;
          },
          setEnhanced: (productId, photoId, enhanced) => {
            const photo = findProduct(productId)?.photos.find((ph) => ph.id === photoId);
            if (!photo || !!photo.enhanced === enhanced) return;
            editPhoto(productId, photoId, (ph) => ({ ...ph, enhanced }));
            enqueue(productId, () => sync!.setEnhancedShown(photoId, enhanced));
          },
          ironClothes: (productId, photoId) => {
            const photo = findProduct(productId)?.photos.find((ph) => ph.id === photoId);
            const original = get().images[photoId];
            if (!photo || !original) return Promise.resolve({ ok: false, error: "That photo is no longer here." });
            const saved = get().images[ironedKey(photoId)];
            if (photo.hasIroned && saved) return Promise.resolve({ ok: true, image: saved });
            const inFlight = ironRequests.get(photoId);
            if (inFlight) return inFlight;

            const run = async (): Promise<IronResult> => {
              set((s) => ({ ironPending: { ...s.ironPending, [photoId]: true } }));
              try {
                // Always edit the untouched opaque upload. Existing cutouts, masks and enhancements remain valid history.
                const image = await requestIroned(original);
                const now = get();
                if (!findProduct(productId)?.photos.some((ph) => ph.id === photoId)) {
                  return { ok: false, error: "That photo was removed." };
                }
                if (now.images[photoId] !== original) {
                  return { ok: false, error: "The photo changed while it was being ironed. Try again." };
                }
                return { ok: true, image };
              } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : "Couldn't iron the clothes." };
              } finally {
                ironRequests.delete(photoId);
                set((s) => {
                  const ironPending = { ...s.ironPending };
                  delete ironPending[photoId];
                  return { ironPending };
                });
              }
            };
            const request = run();
            ironRequests.set(photoId, request);
            return request;
          },
          acceptIroned: async (productId, photoId, image) => {
            if (!findProduct(productId)?.photos.some((ph) => ph.id === photoId)) {
              return { ok: false, error: "That photo is no longer here." };
            }
            try {
              const stored = sync
                ? await enqueueAwait(productId, () => sync.saveIroned(productId, photoId, image))
                : image;
              if (!findProduct(productId)?.photos.some((ph) => ph.id === photoId)) {
                return { ok: false, error: "That photo was removed." };
              }
              set((s) => ({ images: { ...s.images, [ironedKey(photoId)]: stored } }));
              if (demo) await photoDb.put(ironedKey(photoId), stored);
              editPhoto(productId, photoId, (ph) => ({ ...ph, hasIroned: true, showIroned: true }));
              return { ok: true };
            } catch (error) {
              return { ok: false, error: error instanceof Error ? error.message : "Couldn't save the ironed photo." };
            }
          },
          setIroned: (productId, photoId, shown) => {
            const photo = findProduct(productId)?.photos.find((ph) => ph.id === photoId);
            if (!photo?.hasIroned || !!photo.showIroned === shown) return;
            editPhoto(productId, photoId, (ph) => ({ ...ph, showIroned: shown }));
            enqueue(productId, () => sync!.setIronedShown(photoId, shown));
          },
          saveRefinement: async (productId, photoId, refinement) => {
            if (!findProduct(productId)?.photos.find((ph) => ph.id === photoId)?.hasCutout) {
              throw new Error("Remove the photo's background before refining it.");
            }
            const keys = [refinedKey(photoId), maskKey(photoId)] as const;
            // An enhanced cutout gets the same erasing, so the enhanced refinement stays in step.
            // Without it, the stale enhanced copy is dropped: it could show erased areas again.
            const enhancedCutout = get().images[enhancedKey(photoId, "cutout")];
            const enhancedRefined =
              refinement && enhancedCutout ? await withAlphaOf(enhancedCutout, refinement.refined).catch(() => undefined) : undefined;
            // Save first, then show: a failed save leaves the previous version in place.
            if (sync) {
              await enqueueAwait(productId, () =>
                refinement
                  ? sync.saveRefinement(productId, photoId, refinement.refined, refinement.mask)
                  : sync.clearRefinement(productId, photoId),
              );
            } else if (demo) {
              await Promise.all(
                refinement
                  ? [photoDb.put(keys[0], refinement.refined), photoDb.put(keys[1], refinement.mask)]
                  : keys.map((key) => photoDb.remove(key)),
              );
            }
            set((s) => {
              const images = { ...s.images };
              if (refinement) Object.assign(images, { [keys[0]]: refinement.refined, [keys[1]]: refinement.mask });
              else keys.forEach((key) => delete images[key]);
              return { images };
            });
            editPhoto(productId, photoId, (ph) => ({ ...ph, refined: !!refinement }));
            const stale = enhancedKey(photoId, "refined");
            if (enhancedRefined) {
              keepEnhanced(productId, photoId, { refined: enhancedRefined });
            } else if (get().images[stale]) {
              set((s) => {
                const images = { ...s.images };
                delete images[stale];
                return { images };
              });
              if (demo) photoDb.remove(stale);
              // Clearing a refinement already dropped its enhanced copy.
              if (refinement) enqueue(productId, () => sync!.clearEnhanced(productId, photoId, "refined"));
            }
          },
          removePhoto: (productId, photoId) => {
            const product = findProduct(productId);
            const gone = product?.photos.find((ph) => ph.id === photoId);
            if (!product || !gone) return;
            const photos = product.photos.filter((ph) => ph.id !== photoId);
            const variant = product.variants.find((v) => v.id === gone.variantId);
            // Drop a colour row only when its last photo goes and it holds no stock.
            const dropVariant =
              variant && !photos.some((ph) => ph.variantId === variant.id) && variantUnits(product, variant) === 0
                ? variant
                : undefined;
            edit(productId, (p) => ({
              ...p,
              photos,
              variants: dropVariant ? p.variants.filter((v) => v.id !== dropVariant.id) : p.variants,
            }));
            if (demo) {
              photoKeys(photoId).forEach((key) => photoDb.remove(key));
              return;
            }
            later(`undoable:${productId}:photo:${photoId}`, productId, UNDO_WINDOW_MS, () =>
              sync!.removePhoto(productId, photoId, dropVariant?.id),
            );
          },
          setImages: (images) => set((s) => ({ images: { ...images, ...s.images } })),
          setBusy: (delta) => set((s) => ({ busy: Math.max(0, s.busy + delta) })),

          setLayout: (layout) => set({ layout }),
          setFilter: (filter) => set({ filter }),
          setSearch: (search) => set({ search }),
          setSort: (sort) => set({ sort }),

          createCatalogue: (init) => {
            const catalogue = newCatalogue(newId(), init);
            set((s) => ({ catalogues: [...s.catalogues, catalogue], activeCatalogueId: catalogue.id }));
            enqueue(`catalogue:${catalogue.id}`, () => sync!.createCatalogue(catalogue));
            return catalogue.id;
          },
          ensureCatalogue: () => {
            if (!get().catalogues.length) get().createCatalogue();
          },
          updateCatalogue: (id, patch) => {
            set((s) => ({ catalogues: s.catalogues.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
            cataloguePatches.set(id, { ...cataloguePatches.get(id), ...patch });
            later(`catalogue:${id}`, `catalogue:${id}`, TYPING_DEBOUNCE_MS, async () => {
              const pending = cataloguePatches.get(id);
              cataloguePatches.delete(id);
              if (pending) await sync!.updateCatalogue(id, pending);
            });
          },
          deleteCatalogue: (id) => {
            const rest = get().catalogues.filter((c) => c.id !== id);
            if (!rest.length) return; // there's always at least one
            set((s) => ({
              catalogues: rest,
              activeCatalogueId: s.activeCatalogueId === id ? rest[0].id : s.activeCatalogueId,
            }));
            cancelKeys((key) => key === `catalogue:${id}`);
            cataloguePatches.delete(id);
            enqueue(`catalogue:${id}`, () => sync!.deleteCatalogue(id));
          },
          setActiveCatalogue: (id) => set({ activeCatalogueId: id }),

          setThreshold: (threshold) => {
            set({ threshold: Math.max(0, Math.min(99, Math.floor(threshold) || 0)) });
            saveSettingsLater();
          },
          updateSettings: (patch) => {
            const previous = get().settings;
            set((s) => ({ settings: { ...s.settings, ...patch } }));
            const { sizeTemplates, productTypes, ...scalars } = patch;
            if (Object.keys(scalars).length) saveSettingsLater();
            for (const category of ["Clothing", "Shoes"] as Category[]) {
              if (sizeTemplates && sizeTemplates[category] !== previous.sizeTemplates[category]) {
                const sizes = sizeTemplates[category];
                later(`sizes:${category}`, "settings", TYPING_DEBOUNCE_MS, () => sync!.saveSizeTemplate(category, sizes));
              }
              if (productTypes && productTypes[category] !== previous.productTypes[category]) {
                const types = productTypes[category];
                later(`types:${category}`, "settings", TYPING_DEBOUNCE_MS, () => sync!.saveProductTypes(category, types));
              }
            }
          },
          updateStaff: (id, patch) => {
            set((s) => ({
              settings: { ...s.settings, staff: s.settings.staff.map((m) => (m.id === id ? { ...m, ...patch } : m)) },
            }));
            const member = get().settings.staff.find((m) => m.id === id);
            if (member) enqueue("staff", () => sync!.updateStaff(member));
          },
          inviteStaff: (name, email) => {
            const member: StaffMember = {
              id: sync ? `invite:${email.trim().toLowerCase()}` : newId(),
              name: name.trim(),
              email: email.trim(),
              role: "Staff",
              canViewCosts: false,
              canEditPrices: false,
              status: "invited",
            };
            set((s) => ({ settings: { ...s.settings, staff: [...s.settings.staff, member] } }));
            enqueue("staff", () => sync!.inviteStaff(member.name, member.email));
          },
          removeStaff: (id) => {
            const member = get().settings.staff.find((m) => m.id === id);
            if (!member || member.role === "Owner") return; // the owner can't be removed
            set((s) => ({
              settings: {
                ...s.settings,
                staff: sync
                  ? // Accounts stay listed as pending (they can be approved again); invites disappear.
                    s.settings.staff.flatMap((m) =>
                      m.id !== id
                        ? [m]
                        : m.status === "invited"
                          ? []
                          : [{ ...m, status: "pending" as const, canViewCosts: false, canEditPrices: false }],
                    )
                  : s.settings.staff.filter((m) => m.id !== id),
              },
            }));
            enqueue("staff", () => sync!.removeStaff(member));
          },
          setActor: (actor) => set({ actor }),
          resetDemo: () => {
            if (!demo) return;
            photoDb.clear();
            lastGridEdit = null;
            const fresh = seedProducts();
            set({
              products: fresh,
              movements: seedMovements(fresh),
              settings: seedSettings(),
              threshold: 3,
              images: {},
              filter: "All",
              search: "",
              sort: "Newest",
              catalogues: [newCatalogue(newId())],
              activeCatalogueId: null,
            });
          },
        };
      },
      {
        // Separate keys so demo data can never leak into the shared catalogue.
        name: demo ? "jemimas-designs-inventory" : "jemimas-designs-preferences",
        version: 1,
        storage: createJSONStorage(() => localStorage),
        // Rehydrated from the provider after mount so server and first client render match.
        skipHydration: true,
        partialize: (s) =>
          demo
            ? {
                products: s.products,
                threshold: s.threshold,
                layout: s.layout,
                filter: s.filter,
                sort: s.sort,
                movements: s.movements,
                settings: s.settings,
                catalogues: s.catalogues,
                activeCatalogueId: s.activeCatalogueId,
              }
            : { layout: s.layout, filter: s.filter, sort: s.sort, activeCatalogueId: s.activeCatalogueId },
      },
    ),
  );
}

export type InventoryStoreApi = ReturnType<typeof createInventoryStore>;
