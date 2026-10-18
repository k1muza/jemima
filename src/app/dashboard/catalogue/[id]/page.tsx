import type { Metadata } from "next";
import { Suspense } from "react";

import { CatalogueEditor, CatalogueSkeleton } from "../catalogue-editor";

export const metadata: Metadata = { title: "Catalogue" };

export default function CataloguePage({ params }: PageProps<"/dashboard/catalogue/[id]">) {
  return (
    <Suspense fallback={<CatalogueSkeleton />}>
      <CatalogueEditor params={params} />
    </Suspense>
  );
}
