import { beforeEach, describe, expect, it, vi } from "vitest";
const ironClothes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gemini-image", () => ({
  IronInputError: class IronInputError extends Error {},
  ironClothes: (...args: unknown[]) => ironClothes(...args),
}));
vi.mock("@/lib/auth-config", () => ({ isAuthEnabled: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/iron-clothes", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  ironClothes.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});

describe("POST /api/iron-clothes", () => {
  it("returns one edited image without caching it", async () => {
    ironClothes.mockResolvedValueOnce({ image: new Uint8Array([5, 6]).buffer, contentType: "image/jpeg" });
    const response = await post({ image: "data:image/jpeg;base64,AA==" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([5, 6]);
  });

  it("rejects missing input and reports unavailable configuration", async () => {
    expect((await post({})).status).toBe(400);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await post({ image: "x" })).status).toBe(503);
    expect(ironClothes).not.toHaveBeenCalled();
  });

  it("does not expose provider errors", async () => {
    ironClothes.mockRejectedValueOnce(new Error("secret provider response"));
    const response = await post({ image: "x" });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Couldn't iron that photo. Try again." });
  });

  it("maps rate limits and timeouts to retryable responses", async () => {
    const rateLimit = new Error("Quota exceeded");
    rateLimit.name = "RateLimitError";
    ironClothes.mockRejectedValueOnce(rateLimit);
    const limited = await post({ image: "x" });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Gemini image quota is unavailable. Enable billing for this API key or wait for your quota to reset.",
    });
    ironClothes.mockRejectedValueOnce(new Error("Request timed out"));
    expect((await post({ image: "x" })).status).toBe(504);
  });
});
