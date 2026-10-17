import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Whether sign-in is required. On by default; set `AUTH_ENABLED=false` to
 * open the dashboard without signing in. Always off when Supabase isn't
 * configured (demo mode).
 *
 * Server-only value (no NEXT_PUBLIC_ prefix): read it in proxy.ts and server
 * code, never in Client Components. Changing it on Vercel needs a redeploy.
 */
export const isAuthEnabled = isSupabaseConfigured && process.env.AUTH_ENABLED?.trim().toLowerCase() !== "false";
