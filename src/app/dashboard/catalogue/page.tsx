import type { Metadata } from "next";

import { CatalogueList } from "./catalogue-list";

export const metadata: Metadata = { title: "Catalogues" };

export default function CataloguesPage() {
  return <CatalogueList />;
}
