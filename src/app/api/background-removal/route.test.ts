import { beforeEach, describe, expect, it, vi } from "vitest";

const removeBackground = vi.fn();
vi.mock("@/lib/cloudinary", () => ({ removeBackground: (...args: unknown[]) => removeBackground(...args) }));
vi.mock("@/lib/auth-config", () => ({ isAuthEnabled: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/background-removal", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => removeBackground.mockReset());

describe("POST /api/background-removal", () => {
  it("rejects a request without a photo", async () => {
    expect((await post({})).status).toBe(400);
    expect(removeBackground).not.toHaveBeenCalled();
  });

  it("returns the PNG", async () => {
    removeBackground.mockResolvedValueOnce({ status: "done", image: new Uint8Array([1, 2]).buffer, contentType: "image/png" });
    const res = await post({ image: "data:image/jpeg;base64,AA==" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2]);
  });

  it("maps processing, unavailable and failed", async () => {
    removeBackground.mockResolvedValueOnce({ status: "processing" });
    expect((await post({ image: "x" })).status).toBe(202);
    removeBackground.mockResolvedValueOnce({ status: "unavailable" });
    expect((await post({ image: "x" })).status).toBe(503);
    removeBackground.mockResolvedValueOnce({ status: "failed", message: "Nope" });
    const failed = await post({ image: "x" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Nope" });
  });
});
