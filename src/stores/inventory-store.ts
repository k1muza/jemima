import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import { attachPhoto, nameColour, newVariant } from "@/lib/inventory/colour";
import { photoDb } from "@/lib/inventory/photo-db";
import { seedMovements, seedProducts, seedSettings } from "@/lib/inventory/seed";
import { isEmptyProduct, qtyOf, variantUnits } from "@/lib/inventory/stock";
import {
  reasonLabel,
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

export type InventoryState = {
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
  /** Photo id → data URL, loaded from IndexedDB (not persisted in localStorage). */
  images: Record<string, string>;
  /** Photos currently being processed for colour detection. */
  busy: number;
};

export type InventoryActions = {
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

const newId = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;

/** Typed grid edits to the same size within this window merge into one movement. */
const COALESCE_MS = 15_000;
const MAX_MOVEMENTS = 2000;

function blankProduct(sizes: string[]): Product {
  return {
    id: newId("prod"),
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

export function createInventoryStore() {
  return createStore<InventoryStore>()(
    persist(
      (set, get) => {
        /** Immutable update of one product; stamps updatedAt. */
        const edit = (id: string, fn: (p: Product) => Product) =>
          set((s) => ({
            products: s.products.map((p) =>
              p.id === id ? { ...fn(p), updatedAt: new Date().toISOString() } : p,
            ),
          }));
        const editVariant = (productId: string, variantId: string, fn: (v: Variant) => Variant) =>
          edit(productId, (p) => ({
            ...p,
            variants: p.variants.map((v) => (v.id === variantId ? fn(v) : v)),
          }));
        const findVariant = (productId: string, variantId: string) =>
          get().products.find((p) => p.id === productId)?.variants.find((v) => v.id === variantId);
        const record = (movement: Omit<StockMovement, "id" | "actor" | "at">) => {
          const full: StockMovement = { ...movement, id: newId("m"), actor: get().actor, at: new Date().toISOString() };
          set((s) => ({ movements: [full, ...s.movements].slice(0, MAX_MOVEMENTS) }));
          return full;
        };
        let lastGridEdit: { key: string; movementId: string; at: number } | null = null;

        const products = seedProducts();
        return {
          products,
          threshold: 3,
          layout: "Grid",
          filter: "All",
          search: "",
          sort: "Newest",
          movements: seedMovements(products),
          settings: seedSettings(),
          actor: "Jemima",
          images: {},
          busy: 0,

          createProduct: () => {
            const product = blankProduct(get().settings.sizeTemplates.Clothing);
            set((s) => ({ products: [product, ...s.products] }));
            return product.id;
          },
          updateProduct: (id, patch) => edit(id, (p) => ({ ...p, ...patch })),
          setCategory: (id, category) =>
            edit(id, (p) => {
              if (p.category === category) return p;
              const sizes = get().settings.sizeTemplates[category].slice();
              return {
                ...p,
                category,
                sizes,
                variants: p.variants.map((v) => ({
                  ...v,
                  qty: Object.fromEntries(sizes.map((z) => [z, v.qty[z] ?? 0])),
                })),
              };
            }),
          deleteProduct: (id) => {
            get().products.find((p) => p.id === id)?.photos.forEach((ph) => photoDb.remove(ph.id));
            set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
          },
          restoreProduct: (product) => {
            product.photos.forEach((ph) => {
              const dataUrl = get().images[ph.id];
              if (dataUrl) photoDb.put(ph.id, dataUrl);
            });
            set((s) => ({
              products: s.products.some((p) => p.id === product.id)
                ? s.products.map((p) => (p.id === product.id ? product : p))
                : [product, ...s.products],
            }));
          },
          pruneEmptyProducts: () => {
            if (get().products.some(isEmptyProduct)) {
              set((s) => ({ products: s.products.filter((p) => !isEmptyProduct(p)) }));
            }
          },

          setQty: (productId, variantId, size, qty) => {
            const variant = findVariant(productId, variantId);
            if (!variant) return;
            const before = qtyOf(variant, size);
            const stored = qty == null ? null : Math.max(0, Math.floor(qty));
            const after = stored ?? 0;
            editVariant(productId, variantId, (v) => ({ ...v, qty: { ...v.qty, [size]: stored } }));
            if (after === before) return;

            const key = `${productId}|${variantId}|${size}`;
            const now = Date.now();
            const previous = lastGridEdit;
            if (previous && previous.key === key && now - previous.at < COALESCE_MS) {
              // Same edit still in progress (typing "1" then "12"): extend its movement.
              lastGridEdit = { ...previous, at: now };
              set((s) => ({
                movements: s.movements
                  .map((m) =>
                    m.id === previous.movementId
                      ? { ...m, after, delta: after - m.before, at: new Date(now).toISOString() }
                      : m,
                  )
                  .filter((m) => m.delta !== 0),
              }));
              return;
            }
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
          },
          adjustStock: (productId, variantId, size, delta, reason, note = "") => {
            const variant = findVariant(productId, variantId);
            if (!variant) return { ok: false, error: "That item no longer exists." };
            if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "Enter a whole number other than 0." };
            const before = qtyOf(variant, size);
            const after = before + delta;
            if (after < 0) return { ok: false, error: `Only ${before} in stock, so you can remove at most ${before}.` };
            editVariant(productId, variantId, (v) => ({ ...v, qty: { ...v.qty, [size]: after } }));
            lastGridEdit = null;
            return { ok: true, movement: record({ productId, variantId, size, delta, before, after, reason, note: note.trim() }) };
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
          updateVariant: (productId, variantId, patch) =>
            editVariant(productId, variantId, (v) => ({
              ...v,
              ...patch,
              // A user-typed colour name is a correction: detection must not overwrite it.
              colourStatus: patch.colourName !== undefined ? "corrected" : v.colourStatus,
            })),
          addPlainVariant: (productId) =>
            edit(productId, (p) => ({
              ...p,
              variants: [...p.variants, { ...newVariant(p.sizes, newId("v"), "One colour", "#9a948a"), colourStatus: "corrected" }],
            })),
          removeVariant: (productId, variantId) =>
            edit(productId, (p) => {
              const variants = p.variants.filter((v) => v.id !== variantId);
              const fallback = variants[0]?.id;
              return {
                ...p,
                variants,
                photos: fallback
                  ? p.photos.map((ph) => (ph.variantId === variantId ? { ...ph, variantId: fallback } : ph))
                  : p.photos,
              };
            }),
          addSize: (productId, raw) => {
            const size = raw.trim().toUpperCase();
            const product = get().products.find((p) => p.id === productId);
            if (!size || !product || product.sizes.includes(size)) return false;
            edit(productId, (p) => ({
              ...p,
              sizes: [...p.sizes, size],
              variants: p.variants.map((v) => ({ ...v, qty: { ...v.qty, [size]: 0 } })),
            }));
            return true;
          },
          removeSize: (productId, size) =>
            edit(productId, (p) => ({
              ...p,
              sizes: p.sizes.filter((z) => z !== size),
              variants: p.variants.map((v) => {
                const qty = { ...v.qty };
                delete qty[size];
                return { ...v, qty };
              }),
            })),

          addPhoto: (productId, dataUrl, hex) => {
            const photoId = newId("ph");
            photoDb.put(photoId, dataUrl);
            set((s) => ({ images: { ...s.images, [photoId]: dataUrl } }));
            if (get().settings.autoDetectColours) {
              edit(productId, (p) => attachPhoto(p, photoId, hex, () => newId("v")));
              return;
            }
            // Detection off: join the first row, or start an unnamed one.
            edit(productId, (p) => {
              const variants = p.variants.length
                ? p.variants
                : [{ ...newVariant(p.sizes, newId("v"), "Unspecified", "#9a948a"), colourStatus: "unavailable" as const }];
              return { ...p, variants, photos: [...p.photos, { id: photoId, variantId: variants[0].id, hex }] };
            });
          },
          assignPhoto: (productId, photoId, variantId) =>
            edit(productId, (p) => {
              const photo = p.photos.find((ph) => ph.id === photoId);
              if (!photo) return p;
              let variants = p.variants;
              let target = variantId;
              if (target === "own") {
                target = newId("v");
                variants = [...variants, newVariant(p.sizes, target, nameColour(photo.hex), photo.hex)];
              }
              const assigned = target;
              return {
                ...p,
                variants,
                photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, variantId: assigned } : ph)),
              };
            }),
          makeCover: (productId, photoId) =>
            edit(productId, (p) => {
              const photo = p.photos.find((ph) => ph.id === photoId);
              return photo ? { ...p, photos: [photo, ...p.photos.filter((ph) => ph.id !== photoId)] } : p;
            }),
          removePhoto: (productId, photoId) => {
            photoDb.remove(photoId);
            edit(productId, (p) => {
              const gone = p.photos.find((ph) => ph.id === photoId);
              const photos = p.photos.filter((ph) => ph.id !== photoId);
              const variant = gone && p.variants.find((v) => v.id === gone.variantId);
              // Drop a colour row only when its last photo goes and it holds no stock.
              const dropVariant =
                variant && !photos.some((ph) => ph.variantId === variant.id) && variantUnits(p, variant) === 0;
              return {
                ...p,
                photos,
                variants: dropVariant ? p.variants.filter((v) => v.id !== variant.id) : p.variants,
              };
            });
          },
          setImages: (images) => set((s) => ({ images: { ...images, ...s.images } })),
          setBusy: (delta) => set((s) => ({ busy: Math.max(0, s.busy + delta) })),

          setLayout: (layout) => set({ layout }),
          setFilter: (filter) => set({ filter }),
          setSearch: (search) => set({ search }),
          setSort: (sort) => set({ sort }),

          setThreshold: (threshold) => set({ threshold: Math.max(0, Math.min(99, Math.floor(threshold) || 0)) }),
          updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
          updateStaff: (id, patch) =>
            set((s) => ({
              settings: { ...s.settings, staff: s.settings.staff.map((m) => (m.id === id ? { ...m, ...patch } : m)) },
            })),
          inviteStaff: (name, email) =>
            set((s) => ({
              settings: {
                ...s.settings,
                staff: [
                  ...s.settings.staff,
                  {
                    id: newId("staff"),
                    name: name.trim(),
                    email: email.trim(),
                    role: "Staff",
                    canViewCosts: false,
                    canEditPrices: false,
                    status: "invited",
                  },
                ],
              },
            })),
          removeStaff: (id) =>
            set((s) => ({
              // The owner can't be removed.
              settings: { ...s.settings, staff: s.settings.staff.filter((m) => m.id !== id || m.role === "Owner") },
            })),
          setActor: (actor) => set({ actor }),
          resetDemo: () => {
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
        name: "jemimas-designs-inventory",
        version: 1,
        storage: createJSONStorage(() => localStorage),
        // Rehydrated from the provider after mount so server and first client render match.
        skipHydration: true,
        partialize: (s) => ({
          products: s.products,
          threshold: s.threshold,
          layout: s.layout,
          filter: s.filter,
          sort: s.sort,
          movements: s.movements,
          settings: s.settings,
        }),
      },
    ),
  );
}

export type InventoryStoreApi = ReturnType<typeof createInventoryStore>;
