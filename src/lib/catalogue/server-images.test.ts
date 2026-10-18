import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import sharp from "sharp";

import { createServerPhotoRenderer } from "./server-images";

const photoUrl = "https://photo-project.supabase.co/storage/v1/object/sign/product-images/example.jpg?token=test";
const ironedId = "a".repeat(32);
const ironedUrl = `https://res.cloudinary.com/jemima-cloud/image/upload/v100/jemimas-designs/products/ironed-${ironedId}.png`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://photo-project.supabase.co");
  vi.stubEnv("CLOUDINARY_CLOUD_NAME", "jemima-cloud");
});

afterEach(() => vi.unstubAllGlobals());

describe("catalogue server image renderer", () => {
  it("fetches a signed Supabase photo and crops it to the PDF photo box", async () => {
    const photo = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#ff0000" } }).jpeg().toBuffer();
    const fetcher = vi.fn(async () => new Response(new Uint8Array(photo), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const render = createServerPhotoRenderer();
    const first = await render({ hex: "#cccccc", imageUrl: photoUrl }, { width: 80, height: 120 });
    const second = await render({ hex: "#cccccc", imageUrl: photoUrl }, { width: 80, height: 120 });
    expect(first.type).toBe("image/jpeg");
    expect((await sharp(first.bytes).metadata()).width).toBe(80);
    expect((await sharp(second.bytes).metadata()).height).toBe(120);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("supports the trusted Cloudinary folder used for accepted AI ironing images", async () => {
    const photo = await sharp({ create: { width: 20, height: 20, channels: 4, background: "#ffaabb" } }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(photo), { status: 200 })));
    const render = createServerPhotoRenderer();
    const output = await render({ hex: "#aaaaaa", imageUrl: ironedUrl, backdrop: "#ffffff" }, { width: 80, height: 80 });
    expect(output.type).toBe("image/jpeg");
  });

  it("rejects unrelated image URLs without requesting them", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const render = createServerPhotoRenderer();
    await expect(render({ hex: "#000000", imageUrl: "https://attacker.example/private" }, { width: 80, height: 80 }))
      .rejects.toThrow("unsupported storage URL");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
