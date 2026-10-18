import { describe, expect, it } from "vitest";

import { cloudinaryThumbUrl, THUMB_EDGE, thumbSrc } from "./thumbnail";

const CLOUDINARY = "https://res.cloudinary.com/shop/image/upload/v1760000000/jemimas-designs/products/ironed-abc.png";

describe("thumbSrc", () => {
  it("uses the thumbnail made from this exact file", () => {
    expect(thumbSrc({ "https://s/a.jpg?t=1": "https://s/a.jpg.thumb?t=1" }, "https://s/a.jpg?t=1")).toBe("https://s/a.jpg.thumb?t=1");
  });

  it("falls back to the file itself, e.g. a photo just edited on this device", () => {
    expect(thumbSrc({ "https://s/a.jpg?t=1": "https://s/a.jpg.thumb?t=1" }, "data:image/jpeg;base64,AA")).toBe("data:image/jpeg;base64,AA");
    expect(thumbSrc({}, undefined)).toBeUndefined();
  });

  it("resizes Cloudinary photos through their URL", () => {
    expect(thumbSrc({}, CLOUDINARY)).toBe(
      `https://res.cloudinary.com/shop/image/upload/c_limit,w_${THUMB_EDGE},h_${THUMB_EDGE}/f_auto,q_auto/v1760000000/jemimas-designs/products/ironed-abc.png`,
    );
  });
});

describe("cloudinaryThumbUrl", () => {
  it("leaves other URLs and already-transformed ones alone", () => {
    expect(cloudinaryThumbUrl("https://storage.example/a.jpg")).toBeNull();
    expect(cloudinaryThumbUrl("https://res.cloudinary.com/shop/image/upload/e_improve/v1/x.png")).toBeNull();
  });
});
