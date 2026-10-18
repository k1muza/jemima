import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cloudinaryConfig, enhanceImage, removeBackground, signParams } from "./cloudinary";

const config = { cloudName: "demo-cloud", apiKey: "key", apiSecret: "secret" };
const photo = "data:image/jpeg;base64,/9j/AAAA";
const noSleep = async () => {};

const png = (bytes = [137, 80, 78, 71]) => new Response(new Uint8Array(bytes), { status: 200 });
const uploaded = () => Response.json({ public_id: "x" });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("cloudinaryConfig", () => {
  it("needs all three credentials", () => {
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k" })).toBeNull();
    expect(
      cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" }),
    ).toEqual({ cloudName: "c", apiKey: "k", apiSecret: "s" });
  });
});

describe("signParams", () => {
  it("signs sorted params followed by the secret", () => {
    const expected = createHash("sha1").update("overwrite=false&public_id=a/b&timestamp=1secret").digest("hex");
    expect(signParams({ timestamp: "1", public_id: "a/b", overwrite: "false" }, "secret")).toBe(expected);
  });
});

describe("removeBackground", () => {
  it("is unavailable without credentials and makes no request", async () => {
    expect(await removeBackground(photo, { config: null })).toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects input that isn't image data", async () => {
    const result = await removeBackground("https://example.com/a.jpg", { config });
    expect(result.status).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads without overwriting, then fetches the e_background_removal derivative", async () => {
    fetchMock.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(png([1, 2, 3]));
    const result = await removeBackground(photo, { config, sleep: noSleep });

    expect(result.status).toBe("done");
    if (result.status === "done") expect([...new Uint8Array(result.image)]).toEqual([1, 2, 3]);

    const [uploadUrl, init] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
    const form = init.body as FormData;
    expect(form.get("overwrite")).toBe("false");
    expect(form.get("api_key")).toBe("key");
    expect(form.get("file")).toBe(photo);
    expect(form.get("api_secret")).toBeNull(); // the secret is only used to sign
    expect(form.get("signature")).toBe(
      signParams(
        { overwrite: "false", public_id: String(form.get("public_id")), timestamp: String(form.get("timestamp")) },
        "secret",
      ),
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://res.cloudinary.com/demo-cloud/image/upload/e_background_removal/f_png/${form.get("public_id")}`,
    );
  });

  it("names uploads by content, so the same photo reuses the same asset", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.includes("api.cloudinary") ? uploaded() : png()));
    await removeBackground(photo, { config });
    await removeBackground(photo, { config });
    await removeBackground("data:image/jpeg;base64,/9j/BBBB", { config });
    const ids = fetchMock.mock.calls.filter(([url]) => url.includes("api.cloudinary")).map(([, init]) => init.body.get("public_id"));
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("retries while Cloudinary answers 423 (still processing)", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(noSleep);
    fetchMock
      .mockResolvedValueOnce(uploaded())
      .mockResolvedValueOnce(new Response(null, { status: 423 }))
      .mockResolvedValueOnce(new Response(null, { status: 423 }))
      .mockResolvedValueOnce(png());
    const result = await removeBackground(photo, { config, sleep });
    expect(result.status).toBe("done");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it("reports processing once the wait budget is used up", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes("api.cloudinary") ? uploaded() : new Response(null, { status: 423 })),
    );
    expect(await removeBackground(photo, { config, sleep: noSleep, maxWaitMs: 8000 })).toEqual({ status: "processing" });
  });

  it("passes on Cloudinary's upload error", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "Invalid Signature" } }, { status: 401 }));
    expect(await removeBackground(photo, { config })).toEqual({ status: "failed", message: "Invalid Signature" });
  });

  it("fails on other derivative errors", async () => {
    fetchMock.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect((await removeBackground(photo, { config })).status).toBe("failed");
  });

  it("fails cleanly when Cloudinary can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await removeBackground(photo, { config })).toEqual({ status: "failed", message: "Couldn't reach Cloudinary." });
  });
});

describe("enhanceImage", () => {
  const cutout = "data:image/png;base64,iVBORw0K";
  const derivative = () => fetchMock.mock.calls[1][0] as string;
  const publicIdOf = (call: number) => String((fetchMock.mock.calls[call][1].body as FormData).get("public_id"));

  it("applies e_improve to a photo, delivered as an optimised JPEG", async () => {
    fetchMock.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(png([9]));
    const result = await enhanceImage(photo, { config });
    expect(result).toMatchObject({ status: "done", contentType: "image/jpeg" });
    expect(derivative()).toBe(`https://res.cloudinary.com/demo-cloud/image/upload/e_improve/f_jpg/q_auto:good/${publicIdOf(0)}`);
  });

  it("keeps a transparent PNG as PNG, with no generative or AI effects", async () => {
    fetchMock.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(png());
    expect(await enhanceImage(cutout, { config })).toMatchObject({ status: "done", contentType: "image/png" });
    expect(derivative()).toMatch(/\/image\/upload\/e_improve\/f_png\//);
    expect(derivative()).not.toMatch(/e_gen_|e_upscale|e_enhance/);
  });

  it("reuses the asset already uploaded for the same photo (no second upload of new bytes)", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.includes("api.cloudinary") ? uploaded() : png()));
    await removeBackground(photo, { config });
    await enhanceImage(photo, { config });
    expect(publicIdOf(2)).toBe(publicIdOf(0));
    expect(fetchMock.mock.calls[2][1].body.get("overwrite")).toBe("false");
  });

  it("reports a failed transformation", async () => {
    fetchMock.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await enhanceImage(photo, { config })).toEqual({ status: "failed", message: "Cloudinary couldn't enhance the photo (400)." });
  });

  it("is unavailable without credentials", async () => {
    expect(await enhanceImage(photo, { config: null })).toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
