import type { NextConfig } from "next";

// A production deploy without Supabase keys would silently fall back to demo
// mode (no sign-in), so refuse to build it unless auth was switched off on purpose.
// Previews and local builds may still run in demo mode.
const authDisabled = process.env.AUTH_ENABLED?.trim().toLowerCase() === "false";
if (process.env.VERCEL_ENV === "production" && authDisabled) {
  console.warn("⚠ AUTH_ENABLED=false: this production deployment is open to anyone with the URL.");
} else if (process.env.VERCEL_ENV === "production") {
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
  // Server-side catalogue PDFs load bundled font files from disk on Vercel.
  outputFileTracingIncludes: {
    "/api/catalogue/pdf": ["./public/fonts/catalogue/**/*"],
  },
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
