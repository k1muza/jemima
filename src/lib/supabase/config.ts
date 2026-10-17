/**
 * True once real Supabase credentials are set in the environment.
 * Until then the app runs in demo mode: no auth gate, demo data in the browser.
 */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-ref"),
);
