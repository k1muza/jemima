import "server-only";

import { GoogleGenAI } from "@google/genai";

export const IRON_CLOTHES_PROMPT =
  "Edit this product photograph to make the clothing appear naturally ironed and professionally presented. Remove accidental wrinkles, packaging creases and unwanted fabric crumpling. Preserve the garment's exact original colour, shape, fabric texture, stitching, buttons, collars, pockets, logos, patterns, prints and other design features. Preserve intentional pleats and folds that are part of the design. Do not alter the garment's proportions, add or remove accessories, invent details, or change the background. Maintain a realistic, natural fabric appearance rather than making the clothing excessively smooth or artificial. Change only the unwanted wrinkles.";

const DEFAULT_MODEL = "gemini-3.1-flash-lite-image";
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export type IronedImage = { image: ArrayBuffer; contentType: "image/png" | "image/jpeg" };

type ImageClient = Pick<GoogleGenAI, "interactions">;
type IronOptions = {
  apiKey?: string;
  model?: string;
  client?: ImageClient;
  timeoutMs?: number;
};

function readImage(dataUrl: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new IronInputError("That photo couldn't be read.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new IronInputError("That photo is too large to process.");
  return { base64: match[2], mimeType: `image/${match[1]}`, transparent: match[1] === "png" };
}

export class IronInputError extends Error {}

function hasPngAlpha(bytes: Buffer) {
  const signature = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!signature || bytes.length < 26) return false;
  const colourType = bytes[25];
  return colourType === 4 || colourType === 6 || bytes.includes(Buffer.from("tRNS"));
}

/** One manual garment edit through Gemini. The API key stays server-only. */
export async function ironClothes(dataUrl: string, options: IronOptions = {}): Promise<IronedImage> {
  const { base64, mimeType, transparent } = readImage(dataUrl);
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey && !options.client) throw new Error("Gemini is not configured.");
  const client = options.client ?? new GoogleGenAI({ apiKey });
  const response = await client.interactions.create(
    {
      model: options.model ?? (process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL),
      input: [
        { type: "text", text: IRON_CLOTHES_PROMPT },
        { type: "image", mime_type: mimeType, data: base64 },
      ],
      response_format: {
        type: "image",
        image_size: "1K",
        mime_type: transparent ? "image/png" : "image/jpeg",
      },
    },
    { timeout_ms: options.timeoutMs ?? 90_000, retries: { strategy: "none" } },
  );
  const encoded = response.output_image?.data;
  if (!encoded) throw new Error("Gemini returned no edited image.");
  const output = Buffer.from(encoded, "base64");
  if (transparent && !hasPngAlpha(output)) throw new Error("The edited image lost its transparent background.");
  return {
    image: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
    contentType: transparent ? "image/png" : "image/jpeg",
  };
}
