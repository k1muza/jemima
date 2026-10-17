# Jemima's Designs

Dashboard app built with Next.js 16 (App Router, Cache Components), Tailwind CSS v4, shadcn/ui (Base UI), Supabase (Postgres + Auth) and Zustand.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + publishable key
npm run dev
```

Open http://localhost:3000. Signed-out visitors are redirected to `/login`.

### Turning sign-in off

Sign-in is required by default. Set `AUTH_ENABLED=false` (in `.env.local`, or in Vercel followed by a redeploy) to open the dashboard to anyone with the URL; `/login` and `/signup` then redirect to the dashboard. Without Supabase keys, sign-in is always off (demo mode).

### Demo mode

Until real Supabase keys are in `.env.local`, the app runs in **demo mode**: no auth gate, a seeded demo catalogue, and every change saved in the browser (catalogue in localStorage, photos in IndexedDB). "Reset demo data" in the sidebar restores the seed. Setting the keys switches auth back on automatically.

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
  migrations/               # profiles table + RLS + sign-up trigger
```

## Conventions

- **Cache Components is on.** Anything reading cookies/session (`getCurrentUser()`, Supabase server queries) must render inside a `<Suspense>` boundary, otherwise the build fails. Keep layouts static and push session reads down into components.
- **Auth checks:** `proxy.ts` does the optimistic redirect; still call `getCurrentUser()` in Server Actions and Route Handlers before touching data. RLS is the final line of defence.
- **State:** the catalogue currently lives in the Zustand inventory store (`useInventory((s) => s.x)`), created per request via a provider, never as a module-level store. Pages render skeletons until `useInventoryHydrated()` is true. When Supabase is wired up, server data moves to Server Components and the store keeps client UI state (filters, layout).
- **Money** is stored as integer cents (`costCents`, `priceCents`), never floats.
- **Design tokens** (ivory, charcoal, rose, stock-state colours) live in `src/app/globals.css`; the source design is in `design/`.
- Next.js docs for this exact version live in `node_modules/next/dist/docs/` (see `AGENTS.md`).
