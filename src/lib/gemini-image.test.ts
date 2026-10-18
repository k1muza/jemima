import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { IRON_CLOTHES_PROMPT, IronInputError, ironClothes } from "./gemini-image";

const create = vi.fn();
const client = { interactions: { create } } as never;
const jpeg = "data:image/jpeg;base64,/9j/AAAA";

beforeEach(() => create.mockReset());

describe("ironClothes", () => {
  it("uses Gemini image editing with the preservation prompt and cost-controlled output", async () => {
    create.mockResolvedValueOnce({ output_image: { data: Buffer.from([1, 2, 3]).toString("base64") } });
    const result = await ironClothes(jpeg, { client });
    expect(result.contentType).toBe("image/jpeg");
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "gemini-3.1-flash-lite-image",
      input: [
        { type: "text", text: IRON_CLOTHES_PROMPT },
        { type: "image", mime_type: "image/jpeg" },
      ],
      response_format: { type: "image", image_size: "1K", mime_type: "image/jpeg" },
    });
    expect(create.mock.calls[0][1]).toMatchObject({ retries: { strategy: "none" } });
  });

  it("rejects malformed and oversized inputs before making a paid request", async () => {
    await expect(ironClothes("https://example.com/photo.jpg", { client })).rejects.toBeInstanceOf(IronInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it("requires transparent PNG output when the input is transparent", async () => {
    create.mockResolvedValueOnce({ output_image: { data: Buffer.from([1, 2, 3]).toString("base64") } });
    await expect(ironClothes("data:image/png;base64,iVBORw0KGgo=", { client })).rejects.toThrow(/lost its transparent/);
    expect(create.mock.calls[0][0]).toMatchObject({ response_format: { mime_type: "image/png" } });
  });
});
