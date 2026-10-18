import { beforeEach, describe, expect, it, vi } from "vitest";

import { blobToDataUrl, cutoutKey, enhancedKey, photoKeys, photoSrc, refinedKey, requestCutout, requestEnhanced } from "./cutout";

describe("photoSrc", () => {
  const images = { p1: "original", [cutoutKey("p1")]: "cutout" };

  it("shows the original unless the cutout is chosen", () => {
    expect(photoSrc(images, { id: "p1" })).toBe("original");
    expect(photoSrc(images, { id: "p1", showCutout: false })).toBe("original");
    expect(photoSrc(images, { id: "p1", showCutout: true })).toBe("cutout");
  });

  it("falls back to the original when the cutout file isn't loaded", () => {
    expect(photoSrc({ p1: "original" }, { id: "p1", showCutout: true })).toBe("original");
  });
});

describe("blobToDataUrl", () => {
  it("encodes bytes with the blob's type", async () => {
    expect(await blobToDataUrl(new Blob([new Uint8Array([104, 105])], { type: "image/png" }))).toBe("data:image/png;base64,aGk=");
  });
});

describe("requestCutout", () => {
  const photo = "data:image/jpeg;base64,/9j/AAAA";
  const pngResponse = () => new Response(new Blob([new Uint8Array([1, 2])], { type: "image/png" }));
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts the photo data and returns the PNG", async () => {
    fetchMock.mockResolvedValueOnce(pngResponse());
    expect(await requestCutout(photo)).toBe("data:image/png;base64,AQI=");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/background-removal");
    expect(JSON.parse(init.body)).toEqual({ image: photo });
  });

  it("asks again while the server reports processing", async () => {
    const sleep = vi.fn(async () => {});
    fetchMock
      .mockResolvedValueOnce(Response.json({ status: "processing" }, { status: 202 }))
      .mockResolvedValueOnce(pngResponse());
    expect(await requestCutout(photo, { sleep })).toMatch(/^data:image\/png/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("gives up after repeated processing responses", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ status: "processing" }, { status: 202 })));
    await expect(requestCutout(photo, { sleep: async () => {} })).rejects.toThrow(/taking too long/);
  });

  it("throws the server's error message", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Background removal isn't set up yet." }, { status: 503 }));
    await expect(requestCutout(photo)).rejects.toThrow("Background removal isn't set up yet.");
  });

  it("converts a signed URL to image data first", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array([255])], { type: "image/jpeg" })))
      .mockResolvedValueOnce(pngResponse());
    await requestCutout("https://storage.example/photo.jpg?token=1");
    expect(fetchMock.mock.calls[0][0]).toBe("https://storage.example/photo.jpg?token=1");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ image: "data:image/jpeg;base64,/w==" });
  });
});

describe("enhanced versions", () => {
  const images = {
    p1: "original",
    [enhancedKey("p1", "original")]: "original+",
    [cutoutKey("p1")]: "cutout",
    [enhancedKey("p1", "cutout")]: "cutout+",
    [refinedKey("p1")]: "refined",
    [enhancedKey("p1", "refined")]: "refined+",
  };

  it("shows the enhanced copy of whichever version is current", () => {
    expect(photoSrc(images, { id: "p1", enhanced: true })).toBe("original+");
    expect(photoSrc(images, { id: "p1", showCutout: true, enhanced: true })).toBe("cutout+");
    expect(photoSrc(images, { id: "p1", showCutout: true, refined: true, enhanced: true })).toBe("refined+");
  });

  it("shows the plain version when not enhanced, and an unsaved choice overrides the saved one", () => {
    expect(photoSrc(images, { id: "p1", showCutout: true, refined: true })).toBe("refined");
    expect(photoSrc(images, { id: "p1", showCutout: true, enhanced: true }, false)).toBe("cutout");
    expect(photoSrc(images, { id: "p1" }, true)).toBe("original+");
  });

  it("never shows the enhanced original in place of a background-removed version", () => {
    const withoutEnhancedCutout = { ...images, [enhancedKey("p1", "cutout")]: "" };
    expect(photoSrc(withoutEnhancedCutout,{ id: "p1", showCutout: true, enhanced: true })).toBe("cutout");
  });

  it("lists the enhanced files among the photo's files", () => {
    expect(photoKeys("p1")).toEqual(expect.arrayContaining(Object.keys(images)));
  });

  it("requests enhancement from its own route", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([1])], { type: "image/jpeg" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestEnhanced("data:image/jpeg;base64,/9j/AAAA")).toBe("data:image/jpeg;base64,AQ==");
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/enhance");
  });
});
