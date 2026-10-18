import type { Metadata } from "next";
import { Suspense } from "react";

import { CatalogueWebView } from "./catalogue-web-view";

export const metadata: Metadata = { title: "Catalogue" };

export default function CatalogueWebPage({ params }: PageProps<"/dashboard/catalogue/[id]/view">) {
  return (
    <Suspense>
      <CatalogueWebView params={params} />
    </Suspense>
  );
}
