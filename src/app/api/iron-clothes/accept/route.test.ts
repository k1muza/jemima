import { beforeEach, expect, it, vi } from "vitest";

const uploadAcceptedImage = vi.fn();
vi.mock("@/lib/cloudinary", () => ({ uploadAcceptedImage: (...args: unknown[]) => uploadAcceptedImage(...args) }));
vi.mock("@/lib/auth-config", () => ({ isAuthEnabled: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/iron-clothes/accept", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => uploadAcceptedImage.mockReset());

it("uploads only an explicitly accepted preview", async () => {
  uploadAcceptedImage.mockResolvedValueOnce({ status: "done", url: "https://res.cloudinary.com/demo/ironed.jpg" });
  const response = await post({ image: "data:image/jpeg;base64,AA==" });
  expect(await response.json()).toEqual({ url: "https://res.cloudinary.com/demo/ironed.jpg" });
  expect(uploadAcceptedImage).toHaveBeenCalledOnce();
});
