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
export type ColourStatus = "detected" | "needs_review" | "corrected" | "unavailable";

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
  /** A background-removed copy is stored beside the original (see `cutout.ts`). */
  hasCutout?: boolean;
  /** Show the background-removed copy instead of the original. */
  showCutout?: boolean;
  /** The cutout was refined by hand: a refined image and its erase mask are stored too. */
  refined?: boolean;
  /** Show the enhanced copy of the current version (original, cutout or refined), when it exists. */
  enhanced?: boolean;
  /** A separately stored AI-ironed version exists; the upload is never overwritten. */
  hasIroned?: boolean;
  /** Show the accepted AI-ironed version. False restores the previously displayed version. */
  showIroned?: boolean;
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
  /** Canonical WhatsApp Business catalogue item link (see `whatsapp.ts`); absent or "" = none. */
  whatsappCatalogUrl?: string;
  updatedAt: string;
};

/** The product fields edited in place. */
export type ProductPatch = Partial<Pick<Product, "name" | "type" | "sku" | "costCents" | "priceCents" | "whatsappCatalogUrl">>;

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
  /** Names copied at the time of the change, so history reads well after deletions. */
  productName?: string;
  colourName?: string;
  styleLabel?: string;
};

export type CataloguePageLayout = "Grid" | "Feature";

/** The catalogue's visual design; see `CATALOGUE_THEMES`. */
export type CatalogueTheme = "Classic" | "Atelier" | "Lookbook" | "Boutique";

/** A customer-facing catalogue (PDF / web page) built from a selection of products. */
export type Catalogue = {
  id: string;
  /** Internal name; only staff see it. */
  name: string;
  /** Printed on the catalogue. */
  title: string;
  subtitle: string;
  layout: CataloguePageLayout;
  theme: CatalogueTheme;
  cover: boolean;
  showPrices: boolean;
  showColours: boolean;
  hideSoldOut: boolean;
  /** Chosen product ids. `null` = every priced product in stock. */
  productIds: string[] | null;
  /** Editor filters, remembered per catalogue. */
  department: "All" | Category;
  /** Lower-case colour names. */
  colourFilter: string[];
};

export type StaffRole = "Owner" | "Staff";

/** What the signed-in person may do (enforced by the database; mirrored here for the UI). */
export type Access = {
  role: "owner" | "staff" | "pending";
  canViewCosts: boolean;
  canEditPrices: boolean;
};

export const FULL_ACCESS: Access = { role: "owner", canViewCosts: true, canEditPrices: true };

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  canViewCosts: boolean;
  canEditPrices: boolean;
  /** pending = signed up without an invite, waiting for the owner to approve. */
  status: "active" | "invited" | "pending";
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
