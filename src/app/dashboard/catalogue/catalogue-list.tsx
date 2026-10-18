"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { buttonStyles, PageHeader, PhotoFill } from "@/components/inventory/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogueItems, pageCount } from "@/lib/catalogue/model";
import { plural } from "@/lib/inventory/format";
import { thumbSrc } from "@/lib/inventory/thumbnail";
import type { Catalogue } from "@/lib/inventory/types";
import { useInventory, useInventoryHydrated } from "@/providers/inventory-store-provider";

import { NEW_CATALOGUE } from "./catalogue-editor";

export function CatalogueList() {
  const hydrated = useInventoryHydrated();
  if (!hydrated) return <ListSkeleton />;
  return <ListContent />;
}

function ListContent() {
  const router = useRouter();
  const catalogues = useInventory((s) => s.catalogues);
  const ensureCatalogue = useInventory((s) => s.ensureCatalogue);
  const createCatalogue = useInventory((s) => s.createCatalogue);

  // The first visit creates "All pieces".
  useEffect(() => ensureCatalogue(), [catalogues.length, ensureCatalogue]);

  const create = () => router.push(`/dashboard/catalogue/${createCatalogue(NEW_CATALOGUE)}`);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={plural(catalogues.length, "catalogue")}
        title="Catalogues"
        actions={
          <button type="button" onClick={create} className={buttonStyles.primary}>
            + New catalogue
          </button>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-8">
        {catalogues.map((c) => (
          <CatalogueCard key={c.id} catalogue={c} />
        ))}
        <button
          type="button"
          onClick={create}
          className="flex aspect-4/5 items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#cfc6b8] text-sm font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          + New catalogue
        </button>
      </div>
    </div>
  );
}

function CatalogueCard({ catalogue }: { catalogue: Catalogue }) {
  const products = useInventory((s) => s.products);
  const images = useInventory((s) => s.images);
  const thumbs = useInventory((s) => s.thumbs);
  const items = catalogueItems(catalogue, products, images);
  const cover = items[0]?.cover;

  return (
    <Link href={`/dashboard/catalogue/${catalogue.id}`} className="group flex min-w-0 flex-col gap-3">
      <PhotoFill
        hex={cover?.hex ?? "#ebe5db"}
        imageUrl={thumbSrc(thumbs, cover?.imageUrl)}
        className="aspect-4/5 rounded-xl border transition-colors group-hover:border-foreground"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-serif text-[22px] leading-tight">{catalogue.name || "Untitled catalogue"}</span>
        {catalogue.title && <span className="truncate text-[13px] text-muted-foreground">{catalogue.title}</span>}
        <span className="font-mono text-[11px] tracking-[0.06em] text-subtle uppercase">
          {catalogue.theme} · {plural(items.length, "product")} · {plural(pageCount(catalogue, items), "page")}
        </span>
      </span>
    </Link>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-24 w-72" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-4/5 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
