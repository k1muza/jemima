# Jemima's Designs — Inventory Management Dashboard

**Product requirements & implementation specification**  
**Version:** 1.0 — MVP  
**Currency:** USD only  
**Primary users:** Boutique owner and authorised shop staff  
**Status:** Proposed specification

## 1. Product vision

Build a beautiful, mobile-friendly, photo-first inventory management application for **Jemima's Designs**, a boutique selling clothes and shoes. The app should make it exceptionally fast to add, find, photograph, price, and update stock, including garments with multiple colours, styles and sizes.

The experience should feel like curating a fashion catalogue, rather than completing a complex accounting form. Most routine changes should be possible from the product page or inventory table without navigating to a separate editor.

**Guiding principles**
1. **Photo first:** Images are central to the product catalogue and entry process.
2. **Low-friction editing:** Inline updates, smart defaults, duplicate, autosave where safe, and bulk actions.
3. **Automatically inferred colours:** Users should not have to pick colours manually during normal product creation.
4. **One product, many options:** Keep styles, colours, sizes and photos related under one logical product.
5. **Reliable quantities:** Every stock change must be traceable and must not silently overwrite concurrent changes.
6. **Inventory, not commerce:** Do not add orders or sales flows in this phase.

## 2. MVP scope

### Included
- Secure sign-in for owner and staff; role-based permissions.
- Dashboard with current inventory KPIs and stock alerts.
- Product catalogue with image-grid and table views.
- Product creation/editing/duplication/archiving.
- Multiple photos per product and optional variant-specific photo galleries.
- AI-assisted product-colour detection and image grouping; manual correction only as a fallback.
- Clothing and shoe size sets, including custom sizes and ordered display.
- Variants combining **style + inferred colour**; stock tracked per **variant + size**.
- USD cost and retail price, with defaults and per-SKU overrides.
- Easy stock increases/decreases, reason selection, adjustment history, and audit trail.
- Search, filters, sorting, low-stock indicators, and bulk price/stock actions.
- Inventory valuation and potential gross-profit insights.
- Responsive mobile, tablet and desktop UX.
- CSV import/export of products and inventory.

### Explicitly excluded
- Orders, checkout, POS, customer accounts, payments and sales reports.
- Purchase orders, supplier procurement, and delivery management.
- Multi-branch stock transfers and multi-currency pricing.
- Tax/VAT calculation and accounting integrations.
- Public e-commerce storefront and customer-facing catalogue.
- Sales-derived analytics such as best sellers, realised profit, revenue and inventory turnover.

## 3. Navigation and information architecture

**Main navigation:** Dashboard · Products · Inventory · Insights · Settings.

**Dashboard:** Snapshot of stock position and urgent actions.  
**Products:** Photo-led catalogue, product details, add/edit, galleries and variants.  
**Inventory:** Dense, spreadsheet-like view of all product/variant/size combinations, with quick adjustments.  
**Insights:** Valuation, potential margin, category mix, low/zero-stock reports.  
**Settings:** Categories, size templates, alert thresholds, staff access and image/AI preferences.

A persistent **+ Add Product** action should be available on both desktop and mobile.

## 4. Core data model

### 4.1 Product
The conceptual parent item, e.g. **Floral Summer Dress** or **Classic Heels**.

Fields:
- `id` (UUID)
- `product_code` (human-readable unique identifier, system-generated)
- `name` (required)
- `description` (optional)
- `category_id` (required; e.g. Dresses, Tops, Trousers, Sneakers, Heels)
- `status` (`draft | active | archived`)
- `default_cost_cents` and `default_price_cents` (USD; required before activation)
- `low_stock_threshold` (optional; defaults to shop setting)
- `created_at`, `updated_at`, `created_by`, `updated_by`

**Style note:** One product may have variants such as *Sleeveless / Blue* and *Long Sleeve / Blue*. Separate, substantially different designs can be separate products. Staff can rename a style or split a variant into a new product later; avoid forcing a rigid attribute taxonomy at launch.

### 4.2 ProductVariant
One style-and-colour combination belonging to a product.

Fields:
- `id`, `product_id`
- `style_label` (optional free-text label, e.g. Sleeveless, Pleated, Floral Print)
- `colour_name` (AI-inferred, e.g. Navy Blue; editable as a correction)
- `colour_hex` (AI-inferred display swatch; optional)
- `colour_detection_status` (`detected | needs_review | corrected | unavailable`)
- `colour_detection_metadata` (provider/model/version and optional confidence or explanation)
- `created_at`, `updated_at`

Prevent accidental duplicate variants with the same normalized style and colour within a product, while allowing an explicit override when the two variants truly differ.

### 4.3 InventorySKU
The saleable/stocked combination: **product + variant + size**.

Fields:
- `id`, `variant_id`
- `sku_code` (generated unique human-readable identifier)
- `size_label` (e.g. XS, M, XL, EU 38, UK 6, 3–6 Months, One Size)
- `size_sort_order` (numeric; drives correct listing)
- `quantity_on_hand` (integer >= 0)
- `cost_override_cents`, `price_override_cents` (nullable; otherwise inherit from product)
- `low_stock_threshold_override` (nullable)
- `created_at`, `updated_at`, `version` (for concurrency control)

Effective cost/price = SKU override if provided, otherwise product default. **Store currency values as integer cents or equivalent exact DECIMAL, never floating-point money.** Each SKU should have a unique `(variant_id, normalized_size)` pair.

### 4.4 ProductImage
Multiple photos per product, optionally associated with a specific variant.

Fields:
- `id`, `product_id`, `variant_id` (nullable)
- `original_url`, `optimized_url`, `thumbnail_url`
- `sort_order`, `is_cover`
- `width`, `height`, `mime_type`, `file_size`
- `detected_colour_metadata` (optional)
- `created_at`, `uploaded_by`

A product has one cover photo. A variant may have a preferred cover image. Photo order and assignments can be changed without re-uploading.

### 4.5 StockMovement
Immutable record for every successful change in quantity.

Fields:
- `id`, `sku_id`, `delta_quantity`, `quantity_before`, `quantity_after`
- `reason` (`initial_stock | restock | correction | damage | other`)
- `note` (optional; required for corrections/damage if shop policy enabled)
- `actor_user_id`, `created_at`, `idempotency_key`

Changes must update `InventorySKU.quantity_on_hand` and insert `StockMovement` **in one database transaction**. The audit trail is append-only; corrections are new movements, not edits to history. Reject negative resulting quantities. A reversal is another auditable adjustment, not deletion.

### 4.6 Reference entities
`Category`, `SizeTemplate` (ordered size labels, e.g. Womens Clothing, Kids Clothing, EU Shoes, UK Shoes), `User`, `UserRole`, and `AuditEvent` for sensitive non-stock edits such as cost/price changes and photo deletion.

## 5. Dashboard

### KPI cards
- **Stock at Cost (USD):** `SUM(quantity_on_hand × effective_unit_cost)`.
- **Potential Retail Value (USD):** `SUM(quantity_on_hand × effective_selling_price)`.
- **Units in Stock:** `SUM(quantity_on_hand)`.
- **Low-Stock SKUs:** Count where `0 < quantity_on_hand <= effective_low_stock_threshold`.
- **Out-of-Stock SKUs:** Count where `quantity_on_hand = 0`.

**Important:** Stock at cost is an estimate based on the *current assigned unit cost*, not a historical FIFO or weighted-average accounting valuation. The retail value is potential, not booked revenue.

### Sections
- **Attention Needed:** Low-stock, zero-stock and AI colour-grouping review tasks.
- **Recently Updated:** Most recently created/edited products with thumbnails.
- **Collection Preview:** A small grid of product cards.
- **Category Breakdown:** Unit counts and inventory cost by category.
- **Quick Actions:** Add Product, Adjust Stock, Browse Products.

Use a calm fashion-oriented UI: warm ivory background, soft blush accent, charcoal typography, restrained gold accents, generous imagery and subtle rounded cards. Make urgent stock states visually distinct and accessible without relying on colour alone.

## 6. Product catalogue and detail page

### Catalogue
- Toggle **Photo Grid / Compact Table**.
- Each product card displays cover image, name, category, price (or price range), units on hand and optional low-stock badge.
- Search across product name, code, SKU, category, style label and colour name.
- Filters: category, style, inferred colour, size, stock status, price range and active/draft/archive status.
- Sort: newest, name, most units, cost, retail price, last updated.
- Multi-select products for category changes, archive and price changes.

### Detail page
- Large gallery with thumbnails; drag to reorder; replace, delete or set cover image.
- Click-to-edit name, category, description, default cost and default price.
- Variants shown as labelled chips with automatically generated colour swatches and styles.
- For a selected variant, show editable quantities by size in a simple matrix.
- Optional per-SKU price/cost override without forcing duplication of values.
- Stock history panel with date, actor, reason and before/after counts.
- Duplicate Product action copies details, variants, size definitions and optionally photos; **does not copy stock quantities by default**.
- Archive rather than hard-delete products with historic inventory changes.

## 7. Add product: photo-first workflow

### Standard flow
1. Click **+ Add Product**.
2. Drop, browse or capture one or more photos. Show immediate local previews and upload progress.
3. Background image analysis proposes predominant **garment/shoe colours**, ignores the background where feasible, and groups likely matching photos. Suggestions include colour names and swatches.
4. Enter or accept suggested product name, select category, add optional description. Styles can be named only if relevant.
5. Choose a reusable size template or custom size labels. Create a simple quantity grid per colour/style combination.
6. Enter a default cost and selling price in USD once; optionally override for specific sizes/variants.
7. Review summary and **Save Product** (draft allowed with incomplete data; active requires minimum valid data).

### Colour inference requirements
- **No mandatory manual colour picker.** Normally, photos determine colours automatically.
- Analyse the clothing/shoe itself, not the background or a model's skin/hair.
- Attempt colour naming and swatch extraction; support multicolour/patterned items using a practical label such as `Multicolour` or `Black/White`.
- Multiple photos of the same colour/style should be groupable under the same variant.
- Distinct styles in the same colour must remain distinguishable; do not merge solely because colours match.
- When the image contains multiple garments, colour cannot be determined confidently, or results conflict, mark **Needs review** and present the proposed group; let the user accept, move a photo, rename/correct the detected colour, or leave it unspecified.
- **AI must never silently overwrite a corrected colour**, price, existing variant assignment, or user-edited product data.
- If AI is unavailable or times out, image upload and product entry still work; colour remains `unavailable` or `needs_review` until retry. Do not block stock entry.
- Store analysis status and relevant metadata; avoid treating model confidence as an infallible truth.

### Quick Add / bulk intake (MVP-lite)
- Upload many images in one session.
- Offer draft product cards with editable names, groups, size templates, cost and price.
- Save reviewed drafts individually or in batches.
- Do **not** automatically assume that each photo represents a different product; ask for review of ambiguous grouping.

## 8. Inventory management and stock adjustments

The Inventory page is a fast table of one row per SKU with columns: photo, product, style, detected colour, size, quantity, cost, retail price, potential gross margin, stock status and last updated.

### Required interactions
- Click quantity to open a lightweight **Adjust Stock** control: add/remove amount, select reason, optional note, then confirm.
- Provide +/− shortcuts on the product-size matrix; shortcuts should trigger a safe save with immediate feedback and an undo/reversal affordance, not silently alter server data.
- Inline edit costs and retail prices and support **Apply to All Sizes** and **Apply to All Variants**.
- Bulk percentage or fixed-amount price updates with preview before commit.
- Bulk stock adjustments with a review screen; capture a movement per changed SKU.
- Support keyboard traversal and sensible focus behaviour for high-volume desktop entry.
- Make the UI optimistic only if server failure results in visible rollback and actionable error.
- Prevent lost updates using atomic deltas/row versioning and idempotency keys for retries.
- Optional CSV import preview showing validation errors before writing any data; export visible/currently filtered inventory.

### Threshold rules
- Default low-stock threshold set in Settings (suggest initial `3` units per SKU, configurable).
- Product- or SKU-level override allowed.
- `Out of stock`: zero; `Low stock`: positive and <= threshold; `In stock`: above threshold.

## 9. Insights: inventory-based only

- Stock value at cost by category.
- Potential retail value by category.
- Potential gross profit: `SUM(qty × (effective_price − effective_cost))`.
- Potential gross margin: `(retail_value − cost_value) / retail_value × 100` where retail_value > 0.
- Counts of active products, variants, SKUs and units.
- Most heavily stocked products (by units or stock cost; **not** best sellers).
- Low/zero-stock lists and missing sizes by variant.
- Export inventory and valuation as CSV.

Label all margins and profit figures as **potential**. Without sales transactions, do not show realised earnings, historical revenue, sales velocity or inventory turnover.

## 10. UX and visual design

### Design direction
- Boutique aesthetic, restrained and professional: warm ivory, blush/rose, charcoal, muted gold.
- Product photography dominates catalogue cards; use consistent aspect ratios and thumbnails.
- Large touch targets on mobile; usable on smaller phones.
- Mobile product editor uses a clean stepper or sections, with a sticky Save action.
- Desktop inventory uses an efficient wide table with sticky product/size identifiers.
- Keyboard and screen-reader support; visible labels, accessible alerts, adequate contrast.
- Loading skeletons, clear empty states, error recovery and unsaved-change warnings.
- Preserve last-used catalogue filters and preferred grid/table view where appropriate.

### Ease-of-use goals
- Existing SKU quantity adjustment: **a few interactions without navigating away**.
- Change one photo: replace directly in the gallery.
- Update all sizes' default price: one edit and confirm.
- Add another colour: upload its photos, review grouping, assign quantities.
- Duplicate similar product: no need to recreate all sizes and styles manually.

## 11. Permissions and settings

### Roles
- **Owner/Admin:** Full access, including cost data, financial insights, imports, staff permissions and settings.
- **Staff:** Create/edit catalogue, upload photos, adjust stock; cost visibility and price editing controlled by explicit permissions.

### Settings
- Store name and optional logo.
- USD currency fixed for MVP.
- Default size templates and ordered labels.
- Manage product categories.
- Shop-wide low-stock threshold.
- Upload preferences and default image/AI behaviour.
- User management and permission assignments.

Do not expose inventory or supplier-cost data publicly. Require authenticated access, server-side authorisation and audit logging for sensitive changes.

## 12. Technical implementation guidance

**Suggested, not mandatory:** Next.js + TypeScript for the responsive application, PostgreSQL for data, a type-safe ORM, S3-compatible object storage for images, and a replaceable vision/AI service for colour inference. Build image-processing and AI analysis as asynchronous jobs to avoid blocking saves; show progress and support retry.

- Validate file type and actual media content; limit size and count by configurable rules.
- Generate thumbnails and efficient WebP/AVIF derivatives while preserving originals or a high-quality master.
- Strip unnecessary EXIF metadata; serve assets through signed/private or deliberately scoped URLs.
- Keep uploaded-image staging records and periodically clean abandoned uploads.
- Use a transactional stock-movement service; never allow direct quantity mutation without history.
- Exact money arithmetic, server-side validation, pagination and indexed catalogue search.
- Time-stamped change audit, automatic backups and tested restoration path.
- Authorisation on every API mutation, not just hiding UI controls.

### Suggested service boundaries
- `ProductService` — product, variant and SKU lifecycle.
- `MediaService` — uploads, transformations, ordering and association.
- `ColourInferenceService` — colour naming, swatches, photo grouping, confidence/review workflow.
- `InventoryService` — atomic stock adjustments and stock history.
- `InsightsService` — read-only current-stock aggregation.
- `AccessControlService` — authentication and permissions.

### Representative routes / operations
- `GET/POST /api/products`, `GET/PATCH /api/products/:id`, `POST /api/products/:id/duplicate`, `POST /api/products/:id/archive`.
- `POST /api/products/:id/images`, `PATCH /api/images/:id`, `DELETE /api/images/:id`.
- `POST /api/images/analyse-colours` or asynchronous equivalent.
- `GET /api/inventory`, `POST /api/inventory/:skuId/adjust`, `PATCH /api/inventory/:skuId/pricing`, `GET /api/inventory/:skuId/movements`.
- `GET /api/dashboard`, `GET /api/insights`, `GET /api/export/inventory`.

Routes are illustrative and can be implemented as typed server actions or equivalent APIs.

## 13. Acceptance criteria

1. An authorised user can create one product with multiple photos, two styles, several detected colours and size-specific quantities without creating duplicate product records.
2. Uploaded photos generate proposed colour names and swatches without asking the user to select colours manually in the normal flow.
3. A user can correct an incorrect AI colour and the correction persists after re-analysis and future photo uploads.
4. Adding more photos to an existing variant does not reset the variant's stock, price or attributes.
5. A SKU's quantity can be increased/decreased from both its product page and the inventory table, and each successful change creates exactly one movement event.
6. Two concurrent staff updates cannot silently overwrite each other's changes; repeated requests with the same idempotency key do not double-adjust quantities.
7. Quantity cannot become negative; cost and price cannot be negative; invalid size duplicates cannot be saved.
8. Default USD price/cost apply to all SKUs unless a SKU-specific override is set; changing defaults does not replace existing overrides.
9. Product, variant and size counts reconcile with dashboard KPIs, including when some SKU quantities are zero.
10. A user can replace a product photo, choose a cover image and reorder photos from desktop and mobile.
11. Search and filtering work by product name, category, inferred colour, size and stock status.
12. Staff without permission cannot view costs or change prices via either the UI or API.
13. When the AI provider fails, a product can still be saved as a draft and completed later.
14. All Insights profit/margin figures are labelled **potential**, with no sales/revenue/orders UI.
15. Product duplication does not duplicate stock quantities by default.
16. Archived products disappear from the default active catalogue but retain stock adjustment history and can be restored.
17. CSV imports validate product, variant, size and numeric fields and show a preview/error report before applying changes.

## 14. Delivery plan

**Phase 1 — Inventory foundation**  
Authentication and roles; categories and size templates; product/variant/SKU model; product catalogue; create/edit/duplicate/archive; USD pricing; atomic stock movements; searchable inventory matrix; basic dashboard.

**Phase 2 — Photo-first experience**  
Multiple images, uploads, optimized derivatives, drag-and-drop gallery; background colour analysis; proposed swatches; group/review/correct workflow; resilient retries.

**Phase 3 — Efficiency and insight**  
Bulk editing, Quick Add intake, CSV import/export, valuation charts, filtered reports, mobile polish, audit log and accessibility testing.

## 15. Definition of done

The MVP is complete when staff can receive a mixed batch of clothes/shoes, photograph them, group styles/colours with automated suggestions, enter sizes and quantities, set cost/retail price in USD, find stock quickly, adjust quantities with a reliable audit trail, and see accurate inventory value—all without using an orders or sales module.

**Product decision for implementation:** Prioritise the **Add Product, Product Detail, and Inventory Matrix** workflows over decorative analytics. Fast stock handling is the primary measure of success.
