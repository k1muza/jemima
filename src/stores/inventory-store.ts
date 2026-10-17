import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import type { SupabaseInventory } from "@/lib/backend/supabase-inventory";
import { attachPhoto, nameColour, newVariant } from "@/lib/inventory/colour";
import { photoDb } from "@/lib/inventory/photo-db";
import { seedMovements, seedProducts, seedSettings } from "@/lib/inventory/seed";
import { isEmptyProduct, qtyOf, variantUnits } from "@/lib/inventory/stock";
import {
  FULL_ACCESS,
  reasonLabel,
  type Access,
  type Category,
  type MovementReason,
  type Product,
  type ShopSettings,
  type StaffMember,
  type StockMovement,
  type Variant,
} from "@/lib/inventory/types";

export type CatalogueFilter = "All" | "Clothing" | "Shoes" | "Low stock" | "Needs details";
export type CatalogueLayout = "Grid" | "List";
export type CatalogueSort = "Newest" | "Name" | "Most units" | "Cost" | "Retail price" | "Last updated";

export type AdjustResult = { ok: true; movement: StockMovement } | { ok: false; error: string };

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
  /** Photo id → displayable URL (data URL, or a signed Supabase Storage URL). */
  images: Record<string, string>;
  /** Photos currently being processed for colour detection. */
  busy: number;
};

export type InventoryActions = {
  /** Load (or reload) everything from Supabase. No-op in demo mode. */
  load: () => Promise<void>;
  /** Send any batched edits now (e.g. before leaving the page). */
  flushPending: () => Promise<void>;
  hasPending: () => boolean;

  createProduct: () => string;
  updateProduct: (id: string, patch: Partial<Pick<Product, "name" | "type" | "sku" | "costCents" | "priceCents">>) => void;
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
  updateVariant: (productId: string, variantId: string, patch: Partial<Pick<Variant, "colourName" | "style">>) => void;
  addPlainVariant: (productId: string) => void;
  removeVariant: (productId: string, variantId: string) => void;
  addSize: (productId: string, size: string) => boolean;
  removeSize: (productId: string, size: string) => void;

  addPhoto: (productId: string, dataUrl: string, hex: string) => void;
  assignPhoto: (productId: string, photoId: string, variantId: string | "own") => void;
  makeCover: (productId: string, photoId: string) => void;
  removePhoto: (productId: string, photoId: string) => void;
  setImages: (images: Record<string, string>) => void;
  setBusy: (delta: number) => void;

  setLayout: (layout: CatalogueLayout) => void;
  setFilter: (filter: CatalogueFilter) => void;
  setSearch: (search: string) => void;
  setSort: (sort: CatalogueSort) => void;

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
const MAX_MOVEMENTS = 2000;

type ProductPatch = Partial<Pick<Product, "name" | "type" | "sku" | "costCents" | "priceCents">>;

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
        const variantPatches = new Map<string, { colourName?: string; style?: string; colourStatus?: Variant["colourStatus"] }>();
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

          load: async () => {
            if (!sync) return;
            try {
              const snapshot = await sync.load();
              set((s) => ({
                ...snapshot,
                // Keep local previews of photos still uploading.
                images: { ...s.images, ...snapshot.images },
                ready: true,
                loadError: null,
              }));
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
            if (demo) product.photos.forEach((ph) => photoDb.remove(ph.id));
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
                const dataUrl = get().images[ph.id];
                if (dataUrl) photoDb.put(ph.id, dataUrl);
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
            // A user-typed colour name is a correction: detection must not overwrite it.
            const colourStatus = patch.colourName !== undefined ? ("corrected" as const) : undefined;
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
            let created: Variant | null = null;
            let target = variantId;
            if (target === "own") {
              created = newVariant(product.sizes, newId(), nameColour(photo.hex), photo.hex);
              target = created.id;
            }
            const assigned = target;
            edit(productId, (p) => ({
              ...p,
              variants: created ? [...p.variants, created] : p.variants,
              photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, variantId: assigned } : ph)),
            }));
            enqueue(productId, async () => {
              if (created) await sync!.insertVariant(productId, created, product.variants.length);
              await sync!.assignPhoto(photoId, assigned);
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
              photoDb.remove(photoId);
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
              }
            : { layout: s.layout, filter: s.filter, sort: s.sort },
      },
    ),
  );
}

export type InventoryStoreApi = ReturnType<typeof createInventoryStore>;
