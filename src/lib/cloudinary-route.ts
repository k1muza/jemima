import { isAuthEnabled } from "@/lib/auth-config";
import type { Processed } from "@/lib/cloudinary";
import { createClient } from "@/lib/supabase/server";

/**
 * A POST handler running one Cloudinary transformation: { image: dataUrl } → the
 * processed image (200), or JSON: 202 { status: "processing" } (ask again
 * shortly), 503 when Cloudinary isn't configured, 502 { error } when it failed.
 * Credentials never leave the server.
 */
export function cloudinaryRoute(transform: (dataUrl: string) => Promise<Processed>, unavailable: string) {
  return async function POST(request: Request) {
    if (isAuthEnabled) {
      const supabase = await createClient();
      const { data } = await supabase.auth.getClaims();
      if (!data?.claims) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
    if (typeof body?.image !== "string") return Response.json({ error: "No photo was sent." }, { status: 400 });

    const result = await transform(body.image);
    switch (result.status) {
      case "done":
        return new Response(result.image, { headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" } });
      case "processing":
        return Response.json({ status: "processing" }, { status: 202 });
      case "unavailable":
        return Response.json({ error: unavailable }, { status: 503 });
      case "failed":
        return Response.json({ error: result.message }, { status: 502 });
    }
  };
}
