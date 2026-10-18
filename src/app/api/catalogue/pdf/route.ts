import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseInventory } from "@/lib/backend/supabase-inventory";
import { catalogueFileName, catalogueItems } from "@/lib/catalogue/model";
import { buildCataloguePdf } from "@/lib/catalogue/pdf";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const NO_CACHE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server-rendered PDF, displayed by the browser's native PDF viewer.
 * Neither product data nor photo URLs are accepted from query parameters;
 * the signed-in user's RLS-scoped database records are the source of truth.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) {
    return Response.json({ error: "PDF export requires Supabase. Set up your database first." }, { status: 503, headers: NO_CACHE });
  }

  const url = new URL(request.url);
  const catalogueId = url.searchParams.get("catalogueId");
  if (!catalogueId || !UUID.test(catalogueId)) {
    return Response.json({ error: "Invalid catalogue ID." }, { status: 400, headers: NO_CACHE });
  }

  const supabase = await createClient();
  // Check the session rather than trusting a catalogue ID from the browser.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Sign in again to continue." }, { status: 401, headers: NO_CACHE });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || (profile?.role !== "owner" && profile?.role !== "staff")) {
    return Response.json({ error: "You don't have access to catalogue exports." }, { status: 403, headers: NO_CACHE });
  }

  try {
    // The backend respects Supabase RLS and builds from persisted data.
    const snapshot = await createSupabaseInventory(supabase).load();
    const catalogue = snapshot.catalogues.find((c) => c.id === catalogueId);
    if (!catalogue) {
      return Response.json({ error: "Catalogue not found." }, { status: 404, headers: NO_CACHE });
    }
    const items = catalogueItems(catalogue, snapshot.products, snapshot.images);
    if (!items.length) {
      return Response.json({ error: "Add at least one product to the catalogue first." }, { status: 422, headers: NO_CACHE });
    }

    const storeName = snapshot.settings.shopName.trim() || "Jemima's Designs";
    const bytes = await buildCataloguePdf({ catalogue, items, storeName });
    const filename = `${catalogueFileName(catalogue, storeName)}.pdf`;
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...NO_CACHE,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Catalogue PDF generation failed", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "Couldn't generate the catalogue PDF. Please try again." },
      { status: 500, headers: NO_CACHE },
    );
  }
}
