import type { Metadata } from "next";

import { Catalogue } from "./catalogue";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return <Catalogue />;
}
