import type { Metadata } from "next";
import { Suspense } from "react";

import { DetailSkeleton, ProductDetail } from "./product-detail";

export const metadata: Metadata = { title: "Product" };

export default function ProductPage({ params }: PageProps<"/dashboard/products/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ProductDetail params={params} />
    </Suspense>
  );
}
