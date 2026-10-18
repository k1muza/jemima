# Jemima's Designs

Dashboard app built with Next.js 16 (App Router, Cache Components), Tailwind CSS v4, shadcn/ui (Base UI), Supabase (Postgres + Auth) and Zustand.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + publishable key
npm run dev
```

Open http://localhost:3000. Signed-out visitors are redirected to `/login`.

### Two modes

| | **Live** (default) | **Demo** |
|---|---|---|
| When | Supabase keys set and `AUTH_ENABLED` not `false` | No Supabase keys, or `AUTH_ENABLED=false` |
| Sign-in | Required | Off (`/login` redirects to the dashboard) |
| Data | Shared Supabase database + Storage | Seeded catalogue in this browser only (localStorage + IndexedDB) |

The database only answers signed-in staff, so switching sign-in off always means demo data — it never opens the real catalogue to the public. On Vercel, change `AUTH_ENABLED` and redeploy.

### Accounts and permissions

- The **first account** to sign up becomes the **Owner** (full access, settings, staff).
- People the Owner invites in **Settings → Staff & permissions** become **Staff** when they sign up with that email.
- Anyone else who signs up is **waiting for approval** and sees no data until the Owner approves them.
- Per person, the Owner chooses whether staff can **see costs** and **edit prices**. Both are enforced by the database (row-level security + triggers), not just hidden in the UI.

### Data model (supabase/migrations)

`products` → `product_variants` (colour + style) × `product_sizes` → `inventory_skus` (quantity per variant + size). `product_costs` holds unit cost separately so it can be hidden. `product_images` rows point at files in the private `product-images` bucket (shown via signed URLs). `stock_movements` is the append-only history: quantities change only through the `adjust_stock()` function, which updates the SKU and records the movement in one transaction, rejects negative stock, ignores retried requests, and rejects stale edits. A photo can also have a background-removed copy (`cutout_path`, a PNG beside the original — which is never overwritten); `show_cutout` says which version is displayed. A cutout can be refined by hand: `mask_path` is a PNG of what was erased (the cutout stays the untouched base) and `refined_path` the result that is shown. A product can link to its WhatsApp Business catalogue item (`whatsapp_catalog_url`, optional); the database only accepts the canonical `https://wa.me/p/<product id>/<phone number>` form. Removing a size or colour with stock records the write-off; deleting a product with history archives it instead. Money is integer cents (USD).

### Database changes (hosted Supabase)

Put `SUPABASE_DB_URL` (Supabase → Connect → Session pooler) in `.env.local`, then:

```bash
npm run db:push     # apply new files in supabase/migrations
npm run db:types    # regenerate src/types/database.ts from the live schema
```

New migration: `npx supabase migration new <name>`, write the SQL, then `npm run db:push`.

### Local Supabase (optional, needs Docker)

```bash
npm run db:start        # starts Postgres/Auth locally and prints the URL + publishable key
npm run db:reset        # applies supabase/migrations
npm run db:types:local  # regenerates src/types/database.ts from the local schema
```

## Deploying to Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it. The framework (Next.js), build command and output are detected automatically.
2. Under **Environment Variables**, add for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `AUTH_ENABLED` — optional; `false` turns sign-in off (the site becomes public)
   - `GEMINI_API_KEY` and `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — optional; name suggestions and background removal
   - `NEXT_PUBLIC_SITE_URL` — your production URL, e.g. `https://jemimas-designs.vercel.app` (optional fallback; auth emails use the request origin)

   Do **not** add `SUPABASE_DB_URL`; it is only for running migrations from your machine.
3. Deploy. A production build fails fast if the Supabase variables are missing, rather than shipping demo mode.
4. In Supabase → **Authentication → URL Configuration**:
   - **Site URL**: your production URL
   - **Redirect URLs**: `https://<your-domain>/auth/confirm`, plus `https://*-<your-vercel-team>.vercel.app/**` so preview deployments can sign in, and `http://localhost:3000/auth/confirm` for development.

`vercel.json` pins server functions to `cle1` (Cleveland), next to the database in AWS us-east-2. If you move the database, update the region to match.

For a hosted project, set the Auth **Site URL** and add `<site>/auth/confirm` to the redirect URLs.

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` / `build` / `start` | Next.js |
| `lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `test` | Vitest |
| `db:start` / `db:stop` / `db:reset` / `db:types` | Supabase CLI |

## Structure

```
src/
  proxy.ts                  # (formerly middleware) refreshes the Supabase session, guards routes
  app/
    (auth)/                 # /login, /signup, server actions (login, signup, signOut)
    auth/confirm/route.ts   # email-link + OAuth code exchange
    dashboard/              # Overview, products/ (+ [id] detail), inventory/, insights/, settings/
  components/
    ui/                     # shadcn components (add more: npx shadcn@latest add <name>)
    dashboard/              # app sidebar, user menu
    inventory/              # design primitives, money/qty inputs, confirm dialog
  config/nav.ts             # sidebar navigation items
  lib/
    inventory/              # types, seed data, colour detection, stock maths, formatting
    auth.ts                 # getCurrentUser() — Data Access Layer
    supabase/               # browser, server and proxy clients
  providers/                # theme, inventory store, photo upload/drag-and-drop
  stores/inventory-store.ts # Zustand catalogue store (persisted in demo mode)
  types/database.ts         # generated Supabase types
supabase/
  config.toml
  migrations/               # profiles + roles, inventory schema, RLS, adjust_stock(), storage bucket
```

## Conventions

- **Cache Components is on.** Anything reading cookies/session (`getCurrentUser()`, Supabase server queries) must render inside a `<Suspense>` boundary, otherwise the build fails. Keep layouts static and push session reads down into components.
- **Auth checks:** `proxy.ts` does the optimistic redirect; still call `getCurrentUser()` in Server Actions and Route Handlers before touching data. RLS is the final line of defence.
- **State:** pages read the Zustand inventory store (`useInventory((s) => s.x)`), created per request via a provider. In live mode it loads from Supabase ([src/lib/backend/supabase-inventory.ts](src/lib/backend/supabase-inventory.ts)) and saves each change in the background (typing is batched; removals with Undo are held ~6 s; a failed save shows an error and reloads). Pages render skeletons until `useInventoryHydrated()` is true; use `useAccess()` for cost/price permissions.
- **Money** is stored as integer cents (`costCents`, `priceCents`), never floats.
- **Design tokens** (ivory, charcoal, rose, stock-state colours) live in `src/app/globals.css`; the source design is in `design/`.
- Next.js docs for this exact version live in `node_modules/next/dist/docs/` (see `AGENTS.md`).
