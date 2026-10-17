import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import { attachPhoto, nameColour, newVariant } from "@/lib/inventory/colour";
import { photoDb } from "@/lib/inventory/photo-db";
import { seedProducts } from "@/lib/inventory/seed";
import { isEmptyProduct, variantUnits } from "@/lib/inventory/stock";
import { SIZE_TEMPLATES, type Category, type Product, type Variant } from "@/lib/inventory/types";

export type CatalogueFilter = "All" | "Clothing" | "Shoes" | "Low stock" | "Needs details";
export type CatalogueLayout = "Grid" | "List";

export type InventoryState = {
  products: Product[];
  /** Shop-wide low-stock threshold, per size. */
  threshold: number;
  layout: CatalogueLayout;
  filter: CatalogueFilter;
  search: string;
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

  setQty: (productId: string, variantId: string, size: string, qty: number | null) => void;
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
  resetDemo: () => void;
};

export type InventoryStore = InventoryState & InventoryActions;

const newId = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;

function blankProduct(): Product {
  return {
    id: newId("prod"),
    name: "",
    category: "Clothing",
    type: "",
    sku: "",
    costCents: 0,
    priceCents: 0,
    sizes: SIZE_TEMPLATES.Clothing.slice(),
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

        return {
          products: seedProducts(),
          threshold: 3,
          layout: "Grid",
          filter: "All",
          search: "",
          images: {},
          busy: 0,

          createProduct: () => {
            const product = blankProduct();
            set((s) => ({ products: [product, ...s.products] }));
            return product.id;
          },
          updateProduct: (id, patch) => edit(id, (p) => ({ ...p, ...patch })),
          setCategory: (id, category) =>
            edit(id, (p) => {
              if (p.category === category) return p;
              const sizes = SIZE_TEMPLATES[category].slice();
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

          setQty: (productId, variantId, size, qty) =>
            editVariant(productId, variantId, (v) => ({
              ...v,
              qty: { ...v.qty, [size]: qty == null ? null : Math.max(0, Math.floor(qty)) },
            })),
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
            edit(productId, (p) => attachPhoto(p, photoId, hex, () => newId("v")));
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
          resetDemo: () => {
            photoDb.clear();
            set({ products: seedProducts(), images: {}, filter: "All", search: "" });
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
        }),
      },
    ),
  );
}

export type InventoryStoreApi = ReturnType<typeof createInventoryStore>;
