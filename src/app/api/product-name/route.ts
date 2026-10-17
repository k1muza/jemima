import { isAuthEnabled } from "@/lib/auth-config";
import { suggestProductName } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

/**
 * POST { image: dataUrl } → NameSuggestion ({ name, dailyLimit? }).
 * A Route Handler rather than a Server Action: Server Actions run through the
 * router's action queue, so a slow model call would hold up the app's routing.
 */
export async function POST(request: Request) {
  if (isAuthEnabled) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return Response.json({ name: null }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  if (typeof body?.image !== "string") return Response.json({ name: null }, { status: 400 });

  return Response.json(await suggestProductName(body.image));
}
