import { isAuthEnabled } from "@/lib/auth-config";
import { uploadAcceptedImage } from "@/lib/cloudinary";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (isAuthEnabled) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  if (typeof body?.image !== "string") return Response.json({ error: "No photo was sent." }, { status: 400 });
  const result = await uploadAcceptedImage(body.image);
  if (result.status === "done") return Response.json({ url: result.url });
  if (result.status === "unavailable") return Response.json({ error: "Cloudinary isn't set up yet." }, { status: 503 });
  return Response.json({ error: result.message }, { status: 502 });
}
