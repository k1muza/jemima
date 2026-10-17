export type Category = "Clothing" | "Shoes";

export const CATEGORIES: Category[] = ["Clothing", "Shoes"];

export const SIZE_TEMPLATES: Record<Category, string[]> = {
  Clothing: ["XS", "S", "M", "L", "XL", "XXL"],
  Shoes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
};

/**
 * How a variant's colour was set. Detection never overwrites `corrected`;
 * `unavailable` means detection was off or failed for its photos.
 */
export type ColourStatus = "detected" | "corrected" | "unavailable";

/** One colour + style combination of a product (spec: ProductVariant). */
export type Variant = {
  id: string;
  colourName: string;
  colourHex: string;
  colourStatus: ColourStatus;
  style: string;
  /** Quantity on hand per size label. `null` = left blank (counts as 0). */
  qty: Record<string, number | null>;
};

/** Image bytes live in IndexedDB under `id`; this is just the metadata. */
export type Photo = {
  id: string;
  variantId: string;
  /** Colour detected from this photo. */
  hex: string;
};

export type Product = {
  id: string;
  name: string;
  category: Category;
  type: string;
  sku: string;
  /** USD, integer cents. */
  costCents: number;
  priceCents: number;
  sizes: string[];
  variants: Variant[];
  /** First photo is the cover. */
  photos: Photo[];
  updatedAt: string;
};

export type StockStatus = "In stock" | "Low stock" | "Out of stock";

export type MovementReason = "initial_stock" | "restock" | "correction" | "damage" | "other";

export const MOVEMENT_REASONS: { value: MovementReason; label: string }[] = [
  { value: "restock", label: "Restock" },
  { value: "correction", label: "Correction" },
  { value: "damage", label: "Damaged" },
  { value: "initial_stock", label: "Initial stock" },
  { value: "other", label: "Other" },
];

export const reasonLabel = (reason: MovementReason) =>
  MOVEMENT_REASONS.find((r) => r.value === reason)?.label ?? reason;

/** Append-only record of one quantity change on one size of one variant (spec: StockMovement). */
export type StockMovement = {
  id: string;
  productId: string;
  variantId: string;
  size: string;
  delta: number;
  before: number;
  after: number;
  reason: MovementReason;
  note: string;
  actor: string;
  at: string;
};

export type StaffRole = "Owner" | "Staff";

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  canViewCosts: boolean;
  canEditPrices: boolean;
  status: "active" | "invited";
};

export type ShopSettings = {
  shopName: string;
  sizeTemplates: Record<Category, string[]>;
  productTypes: Record<Category, string[]>;
  autoDetectColours: boolean;
  /** Spec: notes required for corrections/damage when the shop policy is on. */
  requireNoteForCorrections: boolean;
  maxPhotoMb: number;
  staff: StaffMember[];
};
