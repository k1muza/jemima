import type { NextConfig } from "next";

// A production deploy without Supabase keys would silently fall back to demo
// mode (no sign-in), so refuse to build it. Previews and local builds may still run in demo mode.
if (process.env.VERCEL_ENV === "production") {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(
    (name) => !process.env[name],
  );
  if (missing.length) {
    throw new Error(`Missing environment variables for production: ${missing.join(", ")}. Add them in Vercel → Settings → Environment Variables.`);
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays available to this site for photographing stock.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
