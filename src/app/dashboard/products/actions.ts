"use server";

import { isAuthEnabled } from "@/lib/auth-config";
import { createClient } from "@/lib/supabase/server";

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
const TIMEOUT_MS = 15_000;
const MAX_IMAGE_CHARS = 900_000;

const PROMPT = `You are naming items for a women's clothing and shoe boutique catalogue.
Identify the main clothing item or pair of shoes in the photo and reply with a short, descriptive product name of 2–5 words in Title Case, e.g. "Floral Midi Dress", "Black Ankle-Strap Heels", "Wide-Leg Denim Jeans".
Reply with the name only: no quotes, punctuation at the end, or explanation. If there is no clothing or footwear in the photo, reply with NONE.`;

/**
 * Suggest a product name from a photo (a JPEG data URL) with Gemini.
 * Returns null on any failure — callers treat the suggestion as optional.
 */
export async function suggestProductName(dataUrl: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!apiKey || !match || dataUrl.length > MAX_IMAGE_CHARS) return null;

  try {
    if (isAuthEnabled) {
      const supabase = await createClient();
      const { data } = await supabase.auth.getClaims();
      if (!data?.claims) return null;
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: match[1], data: match[2] } }, { text: PROMPT }] }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`Gemini name suggestion failed: ${res.status}`);
      return null;
    }

    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
    const name = text.split("\n")[0].replace(/^["'“”*\s]+|["'“”*.\s]+$/g, "").trim();
    if (!name || /^none$/i.test(name) || name.length > 60) return null;
    return name;
  } catch (error) {
    console.warn("Gemini name suggestion failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
