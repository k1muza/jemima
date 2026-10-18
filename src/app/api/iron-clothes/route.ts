import { isAuthEnabled } from "@/lib/auth-config";
import { IronInputError, ironClothes } from "@/lib/gemini-image";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return undefined;
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export async function POST(request: Request) {
  if (isAuthEnabled) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  if (typeof body?.image !== "string") return Response.json({ error: "No photo was sent." }, { status: 400 });
  if (!process.env.GEMINI_API_KEY?.trim()) return Response.json({ error: "AI ironing isn't set up yet." }, { status: 503 });

  try {
    const result = await ironClothes(body.image);
    return new Response(result.image, {
      headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof IronInputError) return Response.json({ error: error.message }, { status: 400 });
    const status = errorStatus(error);
    const name = errorName(error);
    if (status === 429 || name === "RateLimitError") {
      return Response.json(
        { error: "Gemini image quota is unavailable. Enable billing for this API key or wait for your quota to reset." },
        { status: 429 },
      );
    }
    if (
      status === 408 ||
      name === "APIConnectionTimeoutError" ||
      (error instanceof Error && /timeout|timed out/i.test(`${name} ${error.message}`))
    ) {
      return Response.json({ error: "AI ironing took too long. Try again." }, { status: 504 });
    }
    if (status === 503 || name === "InternalServerError") {
      return Response.json({ error: "Gemini image editing is temporarily unavailable. Try again shortly." }, { status: 503 });
    }
    console.error("AI ironing failed", {
      name,
      status,
    });
    return Response.json({ error: "Couldn't iron that photo. Try again." }, { status: 502 });
  }
}
