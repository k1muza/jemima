import { describe, expect, it, vi } from "vitest";

import { cachedSignedUrls } from "./signed-url-cache";

const HOUR = 60 * 60 * 1000;

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

let signatures = 0;
const sign = vi.fn(async (paths: string[]) => paths.map((path) => ({ path, signedUrl: `https://x/${path}?token=${++signatures}` })));
const options = (store: Storage, now: number) => ({ lifetimeMs: 24 * HOUR, minRemainingMs: 12 * HOUR, now, store });

describe("cachedSignedUrls", () => {
  it("reuses a saved link while the version matches and enough time is left", async () => {
    const store = memoryStorage();
    const first = await cachedSignedUrls([{ path: "a.jpg", version: "v1" }], sign, options(store, 0));
    sign.mockClear();
    const again = await cachedSignedUrls([{ path: "a.jpg", version: "v1" }], sign, options(store, 11 * HOUR));
    expect(sign).not.toHaveBeenCalled();
    expect(again.get("a.jpg")).toBe(first.get("a.jpg"));
  });

  it("signs again when the file changed or the link is past half its life", async () => {
    const store = memoryStorage();
    const first = await cachedSignedUrls(
      [
        { path: "a.jpg", version: "v1" },
        { path: "b.jpg", version: "v1" },
      ],
      sign,
      options(store, 0),
    );
    sign.mockClear();
    const changed = await cachedSignedUrls([{ path: "a.jpg", version: "v2" }], sign, options(store, HOUR));
    expect(sign).toHaveBeenCalledWith(["a.jpg"]);
    expect(changed.get("a.jpg")).not.toBe(first.get("a.jpg"));

    sign.mockClear();
    await cachedSignedUrls([{ path: "a.jpg", version: "v2" }], sign, options(store, 14 * HOUR));
    expect(sign).toHaveBeenCalledWith(["a.jpg"]);
  });

  it("forgets links that weren't asked for, and survives broken storage", async () => {
    const store = memoryStorage();
    await cachedSignedUrls([{ path: "gone.jpg", version: "v1" }], sign, options(store, 0));
    await cachedSignedUrls([{ path: "a.jpg", version: "v1" }], sign, options(store, 0));
    expect(store.getItem("jemimas-designs:signed-photo-links")).not.toContain("gone.jpg");

    store.setItem("jemimas-designs:signed-photo-links", "{not json");
    const urls = await cachedSignedUrls([{ path: "a.jpg", version: "v1" }], sign, options(store, 0));
    expect(urls.get("a.jpg")).toMatch(/^https:\/\/x\/a\.jpg/);
  });
});
