import "server-only";

import { headers } from "next/headers";

/**
 * Public origin of the current deployment, for links in auth emails.
 * Prefers the request's own Origin so localhost, Vercel previews and
 * production each link back to themselves without per-environment config.
 */
export async function getSiteUrl() {
  const origin = (await headers()).get("origin");
  if (origin) return origin;

  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  // System env vars Vercel sets on every deployment.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
