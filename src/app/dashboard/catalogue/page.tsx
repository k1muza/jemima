import type { Metadata } from "next";

import { CatalogueEditor } from "./catalogue-editor";

export const metadata: Metadata = { title: "Catalogue" };

export default function CataloguePage() {
  return <CatalogueEditor />;
}
