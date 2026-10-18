import { beforeEach, describe, expect, it, vi } from "vitest";

const photoDb = vi.hoisted(() => ({
  put: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
  all: vi.fn(async () => ({})),
}));
vi.mock("@/lib/inventory/photo-db", () => ({ photoDb }));
/** Pixel work needs a browser; stand in with a readable result: the colours of one image, the alpha of another. */
const withAlphaOf = vi.hoisted(() => vi.fn(async (colour: string, alpha: string) => `${colour}|alpha:${alpha}`));
vi.mock("@/lib/inventory/pixels", () => ({ withAlphaOf }));

import type { SupabaseInventory } from "@/lib/backend/supabase-inventory";
import { cutoutKey, enhancedKey, ironedKey, maskKey, photoKeys, photoSrc, refinedKey } from "@/lib/inventory/cutout";
import type { Product } from "@/lib/inventory/types";

import { createInventoryStore } from "./inventory-store";

const ORIGINAL = "data:image/jpeg;base64,/9j/AAAA";
const CUTOUT = "data:image/png;base64,AQI=";
const REFINED = "data:image/png;base64,UkVG";
const MASK = "data:image/png;base64,TUFTSw==";

const pngResponse = () => new Response(new Blob([new Uint8Array([1, 2])], { type: "image/png" }));
let fetchMock: ReturnType<typeof vi.fn>;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  Object.values(photoDb).forEach((fn) => fn.mockClear());
  withAlphaOf.mockClear();
  fetchMock = vi.fn(async () => pngResponse());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", memoryStorage());
});

/** A demo store holding one product with one photo. */
function demoStore() {
  const store = createInventoryStore({ mode: "demo" });
  const productId = store.getState().createProduct();
  store.getState().addPhoto(productId, ORIGINAL, "#aa3344");
  const photoId = store.getState().products.find((p) => p.id === productId)!.photos[0].id;
  const photo = () => store.getState().products.find((p) => p.id === productId)!.photos.find((ph) => ph.id === photoId)!;
  const shown = () => photoSrc(store.getState().images, photo());
  return { store, productId, photoId, photo, shown };
}

describe("background removal", () => {
  it("is never applied automatically on upload", () => {
    const { photo, shown } = demoStore();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(photo().hasCutout).toBeFalsy();
    expect(shown()).toBe(ORIGINAL);
  });

  it("shows the processed copy and keeps the original", async () => {
    const { store, productId, photoId, photo, shown } = demoStore();
    const pending = store.getState().removeBackground(productId, photoId);
    expect(store.getState().cutoutPending[photoId]).toBe(true);

    expect(await pending).toEqual({ ok: true });
    expect(store.getState().cutoutPending[photoId]).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(photo()).toMatchObject({ hasCutout: true, showCutout: true });
    expect(shown()).toBe(CUTOUT);
    expect(store.getState().images[photoId]).toBe(ORIGINAL);
    expect(photoDb.put).toHaveBeenCalledWith(cutoutKey(photoId), CUTOUT);
    expect(photoDb.put).not.toHaveBeenCalledWith(photoId, CUTOUT);
  });

  it("restores the original instantly and switches back without calling Cloudinary again", async () => {
    const { store, productId, photoId, photo, shown } = demoStore();
    await store.getState().removeBackground(productId, photoId);

    store.getState().restoreOriginal(productId, photoId);
    expect(photo().showCutout).toBe(false);
    expect(shown()).toBe(ORIGINAL);

    expect(await store.getState().removeBackground(productId, photoId)).toEqual({ ok: true });
    expect(shown()).toBe(CUTOUT);
    store.getState().restoreOriginal(productId, photoId);
    await store.getState().removeBackground(productId, photoId);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("joins a repeated click to the request already in flight", async () => {
    const { store, productId, photoId } = demoStore();
    const [a, b] = [store.getState().removeBackground(productId, photoId), store.getState().removeBackground(productId, photoId)];
    expect(await a).toEqual({ ok: true });
    expect(await b).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("processes photos of one product independently", async () => {
    const { store, productId, photoId } = demoStore();
    store.getState().addPhoto(productId, "data:image/jpeg;base64,/9j/BBBB", "#aa3344");
    const second = store.getState().products.find((p) => p.id === productId)!.photos[1].id;

    let failFirst!: (r: Response) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (failFirst = resolve)))
      .mockImplementationOnce(async () => pngResponse());
    const first = store.getState().removeBackground(productId, photoId);
    expect(await store.getState().removeBackground(productId, second)).toEqual({ ok: true });
    expect(store.getState().cutoutPending).toEqual({ [photoId]: true });

    failFirst(Response.json({ error: "Cloudinary is down" }, { status: 502 }));
    expect(await first).toEqual({ ok: false, error: "Cloudinary is down" });
    const photos = store.getState().products.find((p) => p.id === productId)!.photos;
    expect(photos.map((ph) => !!ph.showCutout)).toEqual([false, true]);
  });

  it("keeps the original on failure and allows a retry", async () => {
    const { store, productId, photoId, photo, shown } = demoStore();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Cloudinary is down" }, { status: 502 }));

    expect(await store.getState().removeBackground(productId, photoId)).toEqual({ ok: false, error: "Cloudinary is down" });
    expect(shown()).toBe(ORIGINAL);
    expect(photo().hasCutout).toBeFalsy();
    expect(store.getState().cutoutPending).toEqual({});

    expect(await store.getState().removeBackground(productId, photoId)).toEqual({ ok: true });
    expect(shown()).toBe(CUTOUT);
  });

  it("handles a network failure", async () => {
    const { store, productId, photoId, shown } = demoStore();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await store.getState().removeBackground(productId, photoId)).toEqual({ ok: false, error: "Failed to fetch" });
    expect(shown()).toBe(ORIGINAL);
  });

  it("discards a result for a photo that changed while processing", async () => {
    const { store, productId, photoId, photo, shown } = demoStore();
    let finish!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    const pending = store.getState().removeBackground(productId, photoId);
    store.getState().replacePhotoImage(productId, photoId, "data:image/jpeg;base64,/9j/ROTATED");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    finish(pngResponse());

    expect((await pending).ok).toBe(false);
    expect(photo().hasCutout).toBeFalsy();
    expect(shown()).toBe("data:image/jpeg;base64,/9j/ROTATED");
  });

  it("removes both files with the photo, and puts both back on Undo", async () => {
    const { store, productId, photoId } = demoStore();
    await store.getState().removeBackground(productId, photoId);
    const snapshot = store.getState().products.find((p) => p.id === productId)!;

    store.getState().removePhoto(productId, photoId);
    expect(photoDb.remove).toHaveBeenCalledWith(photoId);
    expect(photoDb.remove).toHaveBeenCalledWith(cutoutKey(photoId));

    photoDb.put.mockClear();
    store.getState().restoreProduct(snapshot);
    expect(photoDb.put).toHaveBeenCalledWith(photoId, ORIGINAL);
    expect(photoDb.put).toHaveBeenCalledWith(cutoutKey(photoId), CUTOUT);
  });

  it("saves a refinement and its mask, and reopens them after a reload (demo)", async () => {
    const { store, productId, photoId, shown } = demoStore();
    await store.getState().removeBackground(productId, photoId);
    await store.getState().saveRefinement(productId, photoId, { refined: REFINED, mask: MASK });
    expect(shown()).toBe(REFINED);
    expect(photoDb.put).toHaveBeenCalledWith(refinedKey(photoId), REFINED);
    expect(photoDb.put).toHaveBeenCalledWith(maskKey(photoId), MASK);
    expect(store.getState().images[cutoutKey(photoId)]).toBe(CUTOUT); // the base is kept

    const reloaded = createInventoryStore({ mode: "demo" });
    await reloaded.persist.rehydrate();
    reloaded.getState().setImages({
      [photoId]: ORIGINAL,
      [cutoutKey(photoId)]: CUTOUT,
      [refinedKey(photoId)]: REFINED,
      [maskKey(photoId)]: MASK,
    });
    const photo = reloaded.getState().products.find((p) => p.id === productId)!.photos[0];
    expect(photo.refined).toBe(true);
    expect(photoSrc(reloaded.getState().images, photo)).toBe(REFINED);
    expect(reloaded.getState().images[maskKey(photoId)]).toBe(MASK); // what the editor reopens with
  });

  it("removes every version with the photo (demo)", async () => {
    const { store, productId, photoId } = demoStore();
    await store.getState().removeBackground(productId, photoId);
    await store.getState().saveRefinement(productId, photoId, { refined: REFINED, mask: MASK });
    store.getState().removePhoto(productId, photoId);
    for (const key of photoKeys(photoId)) expect(photoDb.remove).toHaveBeenCalledWith(key);
  });

  it("persists the chosen version across a reload (demo)", async () => {
    const { store, productId, photoId } = demoStore();
    await store.getState().removeBackground(productId, photoId);

    const reloaded = createInventoryStore({ mode: "demo" });
    await reloaded.persist.rehydrate();
    reloaded.getState().setImages({ [photoId]: ORIGINAL, [cutoutKey(photoId)]: CUTOUT }); // as read back from IndexedDB
    const photo = reloaded.getState().products.find((p) => p.id === productId)!.photos[0];
    expect(photo).toMatchObject({ hasCutout: true, showCutout: true });
    expect(photoSrc(reloaded.getState().images, photo)).toBe(CUTOUT);

    store.getState().restoreOriginal(productId, photoId);
    const again = createInventoryStore({ mode: "demo" });
    await again.persist.rehydrate();
    expect(again.getState().products.find((p) => p.id === productId)!.photos[0].showCutout).toBe(false);
  });
});

describe("background removal with Supabase", () => {
  function supabaseStore() {
    const backend = {
      saveCutout: vi.fn(async () => {}),
      setCutoutShown: vi.fn(async () => {}),
      replacePhotoFile: vi.fn(async () => {}),
      saveRefinement: vi.fn(async () => {}),
      clearRefinement: vi.fn(async () => {}),
    };
    const store = createInventoryStore({ mode: "supabase", backend: backend as unknown as SupabaseInventory });
    const product: Product = {
      id: "prod",
      name: "Linen dress",
      category: "Clothing",
      type: "",
      sku: "",
      costCents: 0,
      priceCents: 0,
      sizes: ["M"],
      variants: [],
      photos: [{ id: "ph", variantId: "", hex: "#aa3344" }],
      updatedAt: new Date().toISOString(),
    };
    store.setState({ products: [product], images: { ph: "https://storage.example/prod/ph.jpg?token=1" } });
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("https://storage.example") ? new Response(new Blob([new Uint8Array([255])], { type: "image/jpeg" })) : pngResponse(),
    );
    return { store, backend };
  }

  it("stores the cutout beside the original and saves which version is shown", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().removeBackground("prod", "ph");
    await store.getState().flushPending();
    expect(backend.saveCutout).toHaveBeenCalledWith("prod", "ph", CUTOUT, true);
    expect(backend.replacePhotoFile).not.toHaveBeenCalled(); // the original file is untouched

    store.getState().restoreOriginal("prod", "ph");
    await store.getState().removeBackground("prod", "ph");
    await store.getState().flushPending();
    expect(backend.setCutoutShown.mock.calls).toEqual([
      ["ph", false],
      ["ph", true],
    ]);
    expect(backend.saveCutout).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/background-removal")).toHaveLength(1);
  });

  it("rotates every version without processing again", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().removeBackground("prod", "ph");
    await store.getState().saveRefinement("prod", "ph", { refined: REFINED, mask: MASK });
    store.getState().replacePhotoImage("prod", "ph", "data:image/jpeg;base64,R1", {
      cutout: "data:image/png;base64,R2",
      refined: "data:image/png;base64,R3",
      mask: "data:image/png;base64,R4",
    });
    await store.getState().flushPending();
    expect(backend.replacePhotoFile).toHaveBeenCalledWith("prod", "ph", "data:image/jpeg;base64,R1");
    expect(backend.saveCutout).toHaveBeenLastCalledWith("prod", "ph", "data:image/png;base64,R2", true);
    expect(backend.saveRefinement).toHaveBeenLastCalledWith("prod", "ph", "data:image/png;base64,R3", "data:image/png;base64,R4");
    expect(store.getState().images[maskKey("ph")]).toBe("data:image/png;base64,R4");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/background-removal")).toHaveLength(1);
  });

  it("saves a refinement beside the cutout, without touching the cutout or original", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().removeBackground("prod", "ph");
    await store.getState().flushPending();
    const calls = fetchMock.mock.calls.length;

    await store.getState().saveRefinement("prod", "ph", { refined: REFINED, mask: MASK });
    expect(backend.saveRefinement).toHaveBeenCalledWith("prod", "ph", REFINED, MASK);
    expect(backend.saveCutout).toHaveBeenCalledOnce();
    expect(backend.replacePhotoFile).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.length).toBe(calls); // manual erasing never calls Cloudinary

    const state = store.getState();
    const photo = state.products[0].photos[0];
    expect(photo.refined).toBe(true);
    expect(photoSrc(state.images, photo)).toBe(REFINED);
    expect(state.images[cutoutKey("ph")]).toBe(CUTOUT);
    expect(state.images.ph).toBe("https://storage.example/prod/ph.jpg?token=1");

    // Every version stays reachable.
    store.getState().restoreOriginal("prod", "ph");
    expect(photoSrc(store.getState().images, store.getState().products[0].photos[0])).toBe(state.images.ph);
  });

  it("keeps the previous version when saving a refinement fails", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().removeBackground("prod", "ph");
    backend.saveRefinement.mockRejectedValueOnce(new Error("Storage is unavailable"));

    await expect(store.getState().saveRefinement("prod", "ph", { refined: REFINED, mask: MASK })).rejects.toThrow(
      "Storage is unavailable",
    );
    const state = store.getState();
    expect(state.products[0].photos[0].refined).toBeFalsy();
    expect(photoSrc(state.images, state.products[0].photos[0])).toBe(CUTOUT);
    expect(state.images[maskKey("ph")]).toBeUndefined();

    // Retrying works.
    await store.getState().saveRefinement("prod", "ph", { refined: REFINED, mask: MASK });
    expect(store.getState().products[0].photos[0].refined).toBe(true);
  });

  it("clears a refinement back to the plain cutout", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().removeBackground("prod", "ph");
    await store.getState().saveRefinement("prod", "ph", { refined: REFINED, mask: MASK });
    await store.getState().saveRefinement("prod", "ph", null);
    expect(backend.clearRefinement).toHaveBeenCalledWith("prod", "ph");
    const state = store.getState();
    expect(state.products[0].photos[0].refined).toBe(false);
    expect(state.images[refinedKey("ph")]).toBeUndefined();
    expect(photoSrc(state.images, state.products[0].photos[0])).toBe(CUTOUT);
  });

  it("refuses to refine a photo without a background-removed version", async () => {
    const { store, backend } = supabaseStore();
    await expect(store.getState().saveRefinement("prod", "ph", { refined: REFINED, mask: MASK })).rejects.toThrow(
      /Remove the photo/,
    );
    expect(backend.saveRefinement).not.toHaveBeenCalled();
  });

  it("saves nothing when processing fails", async () => {
    const { store, backend } = supabaseStore();
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("https://storage.example")
        ? new Response(new Blob([new Uint8Array([255])], { type: "image/jpeg" }))
        : Response.json({ error: "Background removal isn't set up yet." }, { status: 503 }),
    );
    expect(await store.getState().removeBackground("prod", "ph")).toEqual({
      ok: false,
      error: "Background removal isn't set up yet.",
    });
    await store.getState().flushPending();
    expect(backend.saveCutout).not.toHaveBeenCalled();
    expect(backend.setCutoutShown).not.toHaveBeenCalled();
  });
});

describe("enhancement", () => {
  /** What /api/enhance returns (distinct from the background-removal PNG). */
  const ENHANCED = "data:image/png;base64,AwQ=";
  const enhanceCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/enhance");

  function store() {
    const demo = demoStore();
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/enhance" ? new Response(new Blob([new Uint8Array([3, 4])], { type: "image/png" })) : pngResponse(),
    );
    return demo;
  }

  it("is never applied automatically", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    await s.getState().removeBackground(productId, photoId);
    expect(enhanceCalls()).toHaveLength(0);
    expect(photo().enhanced).toBeFalsy();
    expect(shown()).toBe(CUTOUT);
  });

  it("enhances a normal photo beside the original, shown only once saved", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    const pending = s.getState().enhance(productId, photoId);
    expect(s.getState().enhancePending[photoId]).toBe(true);
    expect(await pending).toEqual({ ok: true });
    expect(s.getState().enhancePending).toEqual({});

    expect(s.getState().images[enhancedKey(photoId, "original")]).toBe(ENHANCED);
    expect(photoSrc(s.getState().images, photo(), true)).toBe(ENHANCED); // the preview
    expect(shown()).toBe(ORIGINAL); // nothing changes until saved
    expect(withAlphaOf).not.toHaveBeenCalled(); // an opaque photo needs no transparency work

    s.getState().setEnhanced(productId, photoId, true);
    expect(shown()).toBe(ENHANCED);
    expect(s.getState().images[photoId]).toBe(ORIGINAL); // the original is kept
    expect(photoDb.put).toHaveBeenCalledWith(enhancedKey(photoId, "original"), ENHANCED);
  });

  it("enhances a background-removed photo, keeping exactly the cutout's transparency", async () => {
    const { store: s, productId, photoId, shown } = store();
    await s.getState().removeBackground(productId, photoId);
    expect(await s.getState().enhance(productId, photoId)).toEqual({ ok: true });
    s.getState().setEnhanced(productId, photoId, true);

    expect(JSON.parse(enhanceCalls()[0][1].body)).toEqual({ image: CUTOUT }); // the cutout is what's enhanced
    expect(withAlphaOf).toHaveBeenCalledWith(ENHANCED, CUTOUT);
    expect(shown()).toBe(`${ENHANCED}|alpha:${CUTOUT}`);
    expect(s.getState().images[cutoutKey(photoId)]).toBe(CUTOUT);
    expect(s.getState().images[photoId]).toBe(ORIGINAL);
  });

  it("enhances a refined photo without touching its mask; re-refining keeps it in step without Cloudinary", async () => {
    const { store: s, productId, photoId, shown } = store();
    await s.getState().removeBackground(productId, photoId);
    await s.getState().saveRefinement(productId, photoId, { refined: REFINED, mask: MASK });
    await s.getState().enhance(productId, photoId);
    s.getState().setEnhanced(productId, photoId, true);

    const enhancedCutout = `${ENHANCED}|alpha:${CUTOUT}`;
    // The cutout (the refinement's base) is enhanced; the refinement's erasing is then applied to it.
    expect(withAlphaOf).toHaveBeenLastCalledWith(enhancedCutout, REFINED);
    expect(shown()).toBe(`${enhancedCutout}|alpha:${REFINED}`);
    expect(s.getState().images[maskKey(photoId)]).toBe(MASK);
    expect(s.getState().images[refinedKey(photoId)]).toBe(REFINED);

    const REFINED_AGAIN = "data:image/png;base64,QUdBSU4=";
    await s.getState().saveRefinement(productId, photoId, { refined: REFINED_AGAIN, mask: MASK });
    expect(shown()).toBe(`${enhancedCutout}|alpha:${REFINED_AGAIN}`);
    expect(enhanceCalls()).toHaveLength(1);
  });

  it("drops a stale enhanced refinement rather than bring back erased areas", async () => {
    const { store: s, productId, photoId, shown } = store();
    await s.getState().removeBackground(productId, photoId);
    await s.getState().saveRefinement(productId, photoId, { refined: REFINED, mask: MASK });
    await s.getState().enhance(productId, photoId);
    s.getState().setEnhanced(productId, photoId, true);

    withAlphaOf.mockRejectedValueOnce(new Error("decode failed"));
    const REFINED_AGAIN = "data:image/png;base64,QUdBSU4=";
    await s.getState().saveRefinement(productId, photoId, { refined: REFINED_AGAIN, mask: MASK });
    expect(s.getState().images[enhancedKey(photoId, "refined")]).toBeUndefined();
    expect(shown()).toBe(REFINED_AGAIN);
  });

  it("undoes and redoes instantly, never processing again", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    await s.getState().enhance(productId, photoId);
    s.getState().setEnhanced(productId, photoId, true);
    s.getState().setEnhanced(productId, photoId, false);
    expect(shown()).toBe(ORIGINAL);
    expect(await s.getState().enhance(productId, photoId)).toEqual({ ok: true });
    s.getState().setEnhanced(productId, photoId, true);
    expect(shown()).toBe(ENHANCED);
    expect(photo().enhanced).toBe(true);
    expect(enhanceCalls()).toHaveLength(1);
  });

  it("undo returns to the plain cutout; Restore Original shows the untouched original", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    await s.getState().removeBackground(productId, photoId);
    await s.getState().enhance(productId, photoId);
    s.getState().setEnhanced(productId, photoId, true);

    s.getState().setEnhanced(productId, photoId, false);
    expect(shown()).toBe(CUTOUT); // undo never brings the background back

    s.getState().setEnhanced(productId, photoId, true);
    s.getState().restoreOriginal(productId, photoId);
    expect(photo()).toMatchObject({ showCutout: false, enhanced: false });
    expect(shown()).toBe(ORIGINAL);
  });

  it("joins a repeated click to the enhancement already in flight", async () => {
    const { store: s, productId, photoId } = store();
    const [a, b] = [s.getState().enhance(productId, photoId), s.getState().enhance(productId, photoId)];
    expect(await a).toEqual({ ok: true });
    expect(await b).toEqual({ ok: true });
    expect(enhanceCalls()).toHaveLength(1);
  });

  it("keeps the previous image when enhancement fails, and allows a retry", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Cloudinary couldn't enhance the photo (400)." }, { status: 502 }));
    expect(await s.getState().enhance(productId, photoId)).toEqual({
      ok: false,
      error: "Cloudinary couldn't enhance the photo (400).",
    });
    expect(s.getState().images[enhancedKey(photoId, "original")]).toBeUndefined();
    expect(s.getState().enhancePending).toEqual({});
    expect(shown()).toBe(ORIGINAL);
    expect(photo().enhanced).toBeFalsy();

    expect(await s.getState().enhance(productId, photoId)).toEqual({ ok: true });
    expect(s.getState().images[enhancedKey(photoId, "original")]).toBe(ENHANCED);
  });

  it("discards a result for a photo that changed while processing", async () => {
    const { store: s, productId, photoId } = store();
    let finish!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    const pending = s.getState().enhance(productId, photoId);
    s.getState().replacePhotoImage(productId, photoId, "data:image/jpeg;base64,/9j/ROTATED");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    finish(pngResponse());
    expect((await pending).ok).toBe(false);
    expect(s.getState().images[enhancedKey(photoId, "original")]).toBeUndefined();
  });

  it("persists the chosen version across a reload (demo)", async () => {
    const { store: s, productId, photoId } = store();
    await s.getState().removeBackground(productId, photoId);
    await s.getState().enhance(productId, photoId);
    s.getState().setEnhanced(productId, photoId, true);
    const enhancedCutout = `${ENHANCED}|alpha:${CUTOUT}`;
    expect(photoDb.put).toHaveBeenCalledWith(enhancedKey(photoId, "cutout"), enhancedCutout);

    const reloaded = createInventoryStore({ mode: "demo" });
    await reloaded.persist.rehydrate();
    reloaded.getState().setImages({
      [photoId]: ORIGINAL,
      [cutoutKey(photoId)]: CUTOUT,
      [enhancedKey(photoId, "cutout")]: enhancedCutout,
    });
    const photo = reloaded.getState().products.find((p) => p.id === productId)!.photos[0];
    expect(photo).toMatchObject({ showCutout: true, enhanced: true });
    expect(photoSrc(reloaded.getState().images, photo)).toBe(enhancedCutout);

    s.getState().removePhoto(productId, photoId);
    expect(photoDb.remove).toHaveBeenCalledWith(enhancedKey(photoId, "cutout"));
  });
});

describe("enhancement with Supabase", () => {
  function supabaseStore() {
    const backend = {
      saveCutout: vi.fn(async () => {}),
      setCutoutShown: vi.fn(async () => {}),
      replacePhotoFile: vi.fn(async () => {}),
      saveRefinement: vi.fn(async () => {}),
      clearRefinement: vi.fn(async () => {}),
      saveEnhanced: vi.fn(async () => {}),
      clearEnhanced: vi.fn(async () => {}),
      setEnhancedShown: vi.fn(async () => {}),
    };
    const store = createInventoryStore({ mode: "supabase", backend: backend as unknown as SupabaseInventory });
    const product: Product = {
      id: "prod",
      name: "Linen dress",
      category: "Clothing",
      type: "",
      sku: "",
      costCents: 0,
      priceCents: 0,
      sizes: ["M"],
      variants: [],
      photos: [{ id: "ph", variantId: "", hex: "#aa3344" }],
      updatedAt: new Date().toISOString(),
    };
    store.setState({ products: [product], images: { ph: "https://storage.example/prod/ph.jpg?token=1" } });
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("https://storage.example")
        ? new Response(new Blob([new Uint8Array([255])], { type: "image/jpeg" }))
        : new Response(new Blob([new Uint8Array([3, 4])], { type: "image/jpeg" })),
    );
    return { store, backend };
  }

  it("stores the enhanced copy beside the original, then saves which version is shown", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().enhance("prod", "ph");
    await store.getState().flushPending();
    expect(backend.saveEnhanced).toHaveBeenCalledWith("prod", "ph", "original", "data:image/jpeg;base64,AwQ=");
    expect(backend.setEnhancedShown).not.toHaveBeenCalled(); // not until saved
    expect(backend.replacePhotoFile).not.toHaveBeenCalled(); // the original file is untouched

    store.getState().setEnhanced("prod", "ph", true);
    store.getState().setEnhanced("prod", "ph", false);
    await store.getState().flushPending();
    expect(backend.setEnhancedShown.mock.calls).toEqual([
      ["ph", true],
      ["ph", false],
    ]);
    expect(backend.saveEnhanced).toHaveBeenCalledOnce();
  });

  it("saves nothing when enhancement fails", async () => {
    const { store, backend } = supabaseStore();
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("https://storage.example")
        ? new Response(new Blob([new Uint8Array([255])], { type: "image/jpeg" }))
        : Response.json({ error: "Photo enhancement isn't set up yet." }, { status: 503 }),
    );
    expect(await store.getState().enhance("prod", "ph")).toEqual({ ok: false, error: "Photo enhancement isn't set up yet." });
    await store.getState().flushPending();
    expect(backend.saveEnhanced).not.toHaveBeenCalled();
  });

  it("rotates the enhanced copies too, without processing again", async () => {
    const { store, backend } = supabaseStore();
    await store.getState().enhance("prod", "ph");
    store.getState().replacePhotoImage("prod", "ph", "data:image/jpeg;base64,R1", { enhanced: { original: "data:image/jpeg;base64,R5" } });
    await store.getState().flushPending();
    expect(backend.saveEnhanced).toHaveBeenLastCalledWith("prod", "ph", "original", "data:image/jpeg;base64,R5");
    expect(store.getState().images[enhancedKey("ph", "original")]).toBe("data:image/jpeg;base64,R5");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/enhance")).toHaveLength(1);
  });
});

describe("AI clothes ironing", () => {
  const IRONED = "data:image/jpeg;base64,BQY=";

  function store() {
    const demo = demoStore();
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/iron-clothes"
        ? new Response(new Blob([new Uint8Array([5, 6])], { type: "image/jpeg" }))
        : pngResponse(),
    );
    return demo;
  }

  it("creates a preview manually without changing or overwriting the original", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await s.getState().ironClothes(productId, photoId);
    expect(result).toEqual({ ok: true, image: IRONED });
    expect(shown()).toBe(ORIGINAL);
    expect(photo().hasIroned).toBeFalsy();
    expect(s.getState().images[photoId]).toBe(ORIGINAL);
    expect(photoDb.put).not.toHaveBeenCalledWith(ironedKey(photoId), IRONED);
  });

  it("accepts, persists, restores previous, and reuses the saved version", async () => {
    const { store: s, productId, photoId, photo, shown } = store();
    const preview = await s.getState().ironClothes(productId, photoId);
    if (!preview.ok) throw new Error(preview.error);
    expect(await s.getState().acceptIroned(productId, photoId, preview.image)).toEqual({ ok: true });
    expect(photo()).toMatchObject({ hasIroned: true, showIroned: true });
    expect(shown()).toBe(IRONED);
    expect(s.getState().images[photoId]).toBe(ORIGINAL);
    expect(photoDb.put).toHaveBeenCalledWith(ironedKey(photoId), IRONED);

    s.getState().setIroned(productId, photoId, false);
    expect(shown()).toBe(ORIGINAL);
    s.getState().setIroned(productId, photoId, true);
    expect(shown()).toBe(IRONED);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/iron-clothes")).toHaveLength(1);
  });

  it("joins duplicate clicks into one paid request", async () => {
    const { store: s, productId, photoId } = store();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    const first = s.getState().ironClothes(productId, photoId);
    const second = s.getState().ironClothes(productId, photoId);
    expect(s.getState().ironPending[photoId]).toBe(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    finish(new Response(new Blob([new Uint8Array([5, 6])], { type: "image/jpeg" })));
    expect(await first).toEqual({ ok: true, image: IRONED });
    expect(await second).toEqual({ ok: true, image: IRONED });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(s.getState().ironPending).toEqual({});
  });

  it("preserves a cutout and manual refinement when accepting and undoing", async () => {
    const { store: s, productId, photoId, shown } = store();
    await s.getState().removeBackground(productId, photoId);
    await s.getState().saveRefinement(productId, photoId, { refined: REFINED, mask: MASK });
    const preview = await s.getState().ironClothes(productId, photoId);
    if (!preview.ok) throw new Error(preview.error);
    await s.getState().acceptIroned(productId, photoId, preview.image);
    expect(shown()).toBe(IRONED);
    s.getState().setIroned(productId, photoId, false);
    expect(shown()).toBe(REFINED);
    expect(s.getState().images[maskKey(photoId)]).toBe(MASK);
  });

  it("leaves the active image untouched on API failure or cancel", async () => {
    const { store: s, productId, photoId, shown } = store();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "AI ironing is busy right now." }, { status: 429 }));
    expect(await s.getState().ironClothes(productId, photoId)).toEqual({ ok: false, error: "AI ironing is busy right now." });
    expect(shown()).toBe(ORIGINAL);
    expect(s.getState().images[ironedKey(photoId)]).toBeUndefined();
    // A successful preview that is not accepted is equally non-destructive.
    expect((await s.getState().ironClothes(productId, photoId)).ok).toBe(true);
    expect(shown()).toBe(ORIGINAL);
  });

  it("persists the active selection through a demo reload", async () => {
    const { store: s, productId, photoId } = store();
    const preview = await s.getState().ironClothes(productId, photoId);
    if (!preview.ok) throw new Error(preview.error);
    await s.getState().acceptIroned(productId, photoId, preview.image);
    const reloaded = createInventoryStore({ mode: "demo" });
    await reloaded.persist.rehydrate();
    reloaded.getState().setImages({ [photoId]: ORIGINAL, [ironedKey(photoId)]: IRONED });
    const photo = reloaded.getState().products.find((p) => p.id === productId)!.photos[0];
    expect(photoSrc(reloaded.getState().images, photo)).toBe(IRONED);
  });

  it("uploads and persists an accepted result with Supabase, then restores without uploading again", async () => {
    const backend = {
      saveIroned: vi.fn(async () => "https://res.cloudinary.com/demo/ironed.jpg"),
      setIronedShown: vi.fn(async () => {}),
    };
    const s = createInventoryStore({ mode: "supabase", backend: backend as unknown as SupabaseInventory });
    const product: Product = {
      id: "prod",
      name: "Linen dress",
      category: "Clothing",
      type: "",
      sku: "",
      costCents: 0,
      priceCents: 0,
      sizes: ["M"],
      variants: [],
      photos: [{ id: "ph", variantId: "", hex: "#aa3344" }],
      updatedAt: new Date().toISOString(),
    };
    s.setState({ products: [product], images: { ph: ORIGINAL } });
    expect(await s.getState().acceptIroned("prod", "ph", IRONED)).toEqual({ ok: true });
    expect(backend.saveIroned).toHaveBeenCalledWith("prod", "ph", IRONED);
    expect(photoSrc(s.getState().images, s.getState().products[0].photos[0])).toBe("https://res.cloudinary.com/demo/ironed.jpg");
    s.getState().setIroned("prod", "ph", false);
    s.getState().setIroned("prod", "ph", true);
    await s.getState().flushPending();
    expect(backend.saveIroned).toHaveBeenCalledOnce();
    expect(backend.setIronedShown.mock.calls).toEqual([["ph", false], ["ph", true]]);
  });

  it("keeps the previous image active when Cloudinary persistence fails", async () => {
    const backend = { saveIroned: vi.fn(async () => { throw new Error("Storage unavailable"); }) };
    const s = createInventoryStore({ mode: "supabase", backend: backend as unknown as SupabaseInventory });
    const product: Product = {
      id: "prod", name: "Dress", category: "Clothing", type: "", sku: "", costCents: 0, priceCents: 0,
      sizes: ["M"], variants: [], photos: [{ id: "ph", variantId: "", hex: "#aa3344" }], updatedAt: new Date().toISOString(),
    };
    s.setState({ products: [product], images: { ph: ORIGINAL } });
    expect(await s.getState().acceptIroned("prod", "ph", IRONED)).toEqual({ ok: false, error: "Storage unavailable" });
    expect(photoSrc(s.getState().images, s.getState().products[0].photos[0])).toBe(ORIGINAL);
  });
});

describe("WhatsApp catalogue URL", () => {
  const ITEM = "https://wa.me/p/7429384729384723/263771234567";

  function supabaseStore() {
    const backend = {
      createProduct: vi.fn(async () => {}),
      updateProduct: vi.fn(async () => {}),
    };
    const store = createInventoryStore({ mode: "supabase", backend: backend as unknown as SupabaseInventory });
    return { store, backend };
  }
  const productOf = (store: ReturnType<typeof createInventoryStore>, id: string) =>
    store.getState().products.find((p) => p.id === id)!;

  it("creates products without a link", () => {
    const { store } = supabaseStore();
    const id = store.getState().createProduct();
    expect(productOf(store, id).whatsappCatalogUrl).toBeUndefined();
  });

  it("saves, changes and removes the link", async () => {
    const { store, backend } = supabaseStore();
    const id = store.getState().createProduct();

    store.getState().updateProduct(id, { whatsappCatalogUrl: ITEM });
    await store.getState().flushPending();
    expect(productOf(store, id).whatsappCatalogUrl).toBe(ITEM);

    store.getState().updateProduct(id, { whatsappCatalogUrl: "" });
    await store.getState().flushPending();
    expect(productOf(store, id).whatsappCatalogUrl).toBe("");
    expect(backend.updateProduct.mock.calls).toEqual([
      [id, { whatsappCatalogUrl: ITEM }],
      [id, { whatsappCatalogUrl: "" }],
    ]);
  });

  it("keeps the link when other details are edited", async () => {
    const { store, backend } = supabaseStore();
    const id = store.getState().createProduct();
    store.getState().updateProduct(id, { whatsappCatalogUrl: ITEM });
    await store.getState().flushPending();

    store.getState().updateProduct(id, { name: "Linen dress" });
    store.getState().updateProduct(id, { sku: "LD-01", priceCents: 4500 });
    await store.getState().flushPending();
    expect(productOf(store, id)).toMatchObject({ name: "Linen dress", sku: "LD-01", priceCents: 4500, whatsappCatalogUrl: ITEM });
    expect(backend.updateProduct).toHaveBeenLastCalledWith(id, { name: "Linen dress", sku: "LD-01", priceCents: 4500 });
  });

  it("is remembered in the demo", async () => {
    const store = createInventoryStore({ mode: "demo" });
    const id = store.getState().createProduct();
    store.getState().updateProduct(id, { name: "Linen dress", whatsappCatalogUrl: ITEM });
    const reloaded = createInventoryStore({ mode: "demo" });
    await reloaded.persist.rehydrate();
    expect(productOf(reloaded, id).whatsappCatalogUrl).toBe(ITEM);
  });
});

describe("moving a photo between colour rows", () => {
  const product = (store: ReturnType<typeof demoStore>["store"], id: string) => store.getState().products.find((p) => p.id === id)!;

  it("does nothing when the photo is already alone in its own row", () => {
    const { store, productId, photoId } = demoStore();
    const before = product(store, productId).variants;
    store.getState().assignPhoto(productId, photoId, "own");
    store.getState().assignPhoto(productId, photoId, "own");
    expect(product(store, productId).variants).toEqual(before);
  });

  it("drops the row left behind when it has no photos and no stock", () => {
    const { store, productId, photoId } = demoStore();
    store.getState().addPhoto(productId, ORIGINAL, "#aa3344"); // joins the same row
    const second = product(store, productId).photos[1].id;
    store.getState().assignPhoto(productId, second, "own");
    expect(product(store, productId).variants).toHaveLength(2);
    const [first, own] = product(store, productId).variants;

    // Moving the second photo back empties its own row, which goes.
    store.getState().assignPhoto(productId, second, first.id);
    expect(product(store, productId).variants.map((v) => v.id)).toEqual([first.id]);

    // A row holding stock stays.
    store.getState().assignPhoto(productId, photoId, "own");
    const kept = product(store, productId).variants[1];
    store.getState().setQty(productId, kept.id, product(store, productId).sizes[0], 3);
    store.getState().assignPhoto(productId, photoId, first.id);
    expect(product(store, productId).variants.map((v) => v.id)).toEqual([first.id, kept.id]);
    expect(own.id).not.toBe(kept.id);
  });
});
