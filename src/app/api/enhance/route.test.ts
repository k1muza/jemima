import { beforeEach, describe, expect, it, vi } from "vitest";

const enhanceImage = vi.fn();
vi.mock("@/lib/cloudinary", () => ({ enhanceImage: (...args: unknown[]) => enhanceImage(...args) }));
vi.mock("@/lib/auth-config", () => ({ isAuthEnabled: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/enhance", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => enhanceImage.mockReset());

describe("POST /api/enhance", () => {
  it("rejects a request without a photo", async () => {
    expect((await post({})).status).toBe(400);
    expect(enhanceImage).not.toHaveBeenCalled();
  });

  it("returns the enhanced image with its type", async () => {
    enhanceImage.mockResolvedValueOnce({ status: "done", image: new Uint8Array([7]).buffer, contentType: "image/jpeg" });
    const res = await post({ image: "data:image/jpeg;base64,AA==" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([7]);
  });

  it("maps processing, unavailable and failed", async () => {
    enhanceImage.mockResolvedValueOnce({ status: "processing" });
    expect((await post({ image: "x" })).status).toBe(202);
    enhanceImage.mockResolvedValueOnce({ status: "unavailable" });
    const unavailable = await post({ image: "x" });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "Photo enhancement isn't set up yet." });
    enhanceImage.mockResolvedValueOnce({ status: "failed", message: "Nope" });
    expect((await post({ image: "x" })).status).toBe(502);
  });
});
