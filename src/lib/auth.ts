import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { isAuthEnabled } from "@/lib/auth-config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isDemo: boolean;
};

/** Stand-in user when sign-in is off. */
const DEMO_USER: CurrentUser = {
  id: "demo",
  email: isSupabaseConfigured ? "sign-in disabled" : "demo mode",
  name: "Jemima",
  avatarUrl: null,
  isDemo: true,
};

/**
 * Data Access Layer entry point: returns the signed-in user or redirects to /login
 * (or a stand-in user when auth is disabled — see auth-config.ts).
 * Reads cookies, so call it from a component inside a <Suspense> boundary
 * (required with `cacheComponents`). Deduplicated per request via React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  if (!isAuthEnabled) return DEMO_USER;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const claims = data.claims;
  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const email = claims.email ?? "";

  return {
    id: claims.sub,
    email,
    name: (metadata.full_name as string | undefined) ?? email.split("@")[0],
    avatarUrl: (metadata.avatar_url as string | undefined) ?? null,
    isDemo: false,
  };
});
