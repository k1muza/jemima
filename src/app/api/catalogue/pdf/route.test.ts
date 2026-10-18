import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfile: vi.fn(),
  load: vi.fn(),
  buildPdf: vi.fn(),
  items: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.getProfile }) }) }),
  }),
}));
vi.mock("@/lib/backend/supabase-inventory", () => ({
  createSupabaseInventory: () => ({ load: mocks.load }),
}));
vi.mock("@/lib/catalogue/pdf", () => ({
  buildCataloguePdf: mocks.buildPdf,
}));
vi.mock("@/lib/catalogue/model", () => ({
  catalogueItems: mocks.items,
  catalogueFileName: () => "jemimas-designs-summer",
}));

import { GET } from "./route";

const id = "dd4935b2-673d-4cd1-bfca-1cc9c2bf6021";
const makeRequest = (query = `catalogueId=${id}`) =>
  new Request(`https://example.com/api/catalogue/pdf?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mocks.getProfile.mockResolvedValue({ data: { role: "staff" }, error: null });
  mocks.load.mockResolvedValue({
    catalogues: [{ id, name: "Summer", cover: true }],
    products: [{}],
    images: {},
    settings: { shopName: "Jemima's Designs" },
  });
  mocks.items.mockReturnValue([{ id: "p1" }]);
  mocks.buildPdf.mockResolvedValue(Uint8Array.from([37, 80, 68, 70]));
});

describe("GET /api/catalogue/pdf", () => {
  it("renders an authenticated catalogue as an inline PDF", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain('inline; filename="jemimas-designs-summer.pdf"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([37, 80, 68, 70]);
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.buildPdf).toHaveBeenCalledOnce();
  });

  it("allows a forced download from the same endpoint", async () => {
    const response = await GET(makeRequest(`catalogueId=${id}&download=1`));
    expect(response.headers.get("content-disposition")).toContain("attachment;");
  });

  it("requires a valid catalogue ID and a signed-in session", async () => {
    expect((await GET(makeRequest("catalogueId=not-a-uuid"))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET(makeRequest())).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("rejects pending accounts and missing catalogues", async () => {
    mocks.getProfile.mockResolvedValueOnce({ data: { role: "pending" }, error: null });
    expect((await GET(makeRequest())).status).toBe(403);
    mocks.load.mockResolvedValueOnce({ catalogues: [], products: [], images: {}, settings: { shopName: "Jemima's Designs" } });
    expect((await GET(makeRequest())).status).toBe(404);
  });

  it("does not generate empty catalogues", async () => {
    mocks.items.mockReturnValueOnce([]);
    expect((await GET(makeRequest())).status).toBe(422);
    expect(mocks.buildPdf).not.toHaveBeenCalled();
  });

  it("keeps generator errors and storage details away from the browser", async () => {
    mocks.buildPdf.mockRejectedValueOnce(new Error("sensitive storage URL"));
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive storage URL");
  });
});
