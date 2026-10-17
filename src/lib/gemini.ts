import "server-only";

// Flash-Lite: naming a garment is a simple task, and it's quicker with a larger free quota.
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const TIMEOUT_MS = 12_000;
const MAX_IMAGE_CHARS = 900_000;

const PROMPT = `You are naming items for a women's clothing and shoe boutique catalogue.
Identify the main clothing item or pair of shoes in the photo and reply with a short, descriptive product name of 2–5 words in Title Case, e.g. "Floral Midi Dress", "Black Ankle-Strap Heels", "Wide-Leg Denim Jeans".
Reply with the name only: no quotes, punctuation at the end, or explanation. If there is no clothing or footwear in the photo, reply with NONE.`;

/** `dailyLimit` is set when the model's per-day quota is used up; `resetsInSeconds` when Gemini says. */
export type NameSuggestion = { name: string | null; dailyLimit?: { resetsInSeconds?: number } };

type GeminiError = {
  error?: { details?: { "@type"?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[] };
};

/** A 429 is either a short per-minute limit or the daily quota; only the latter is worth surfacing. */
async function dailyLimit(res: Response): Promise<NameSuggestion["dailyLimit"]> {
  const details = ((await res.json().catch(() => null)) as GeminiError | null)?.error?.details ?? [];
  const daily = details.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? "")));
  if (!daily) return undefined;
  const delay = Number.parseFloat(details.find((d) => d.retryDelay)?.retryDelay ?? "");
  return Number.isFinite(delay) ? { resetsInSeconds: Math.round(delay) } : {};
}

/**
 * Suggest a product name from a photo (a JPEG data URL) with Gemini.
 * Never throws: any failure comes back as `{ name: null }`.
 */
export async function suggestProductName(dataUrl: string): Promise<NameSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!apiKey || !match || dataUrl.length > MAX_IMAGE_CHARS) return { name: null };

  try {
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
      return { name: null, dailyLimit: res.status === 429 ? await dailyLimit(res) : undefined };
    }

    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
    const name = text.split("\n")[0].replace(/^["'“”*\s]+|["'“”*.\s]+$/g, "").trim();
    if (!name || /^none$/i.test(name) || name.length > 60) return { name: null };
    return { name };
  } catch (error) {
    console.warn("Gemini name suggestion failed:", error instanceof Error ? error.message : error);
    return { name: null };
  }
}
