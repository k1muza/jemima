import type { Metadata } from "next";

import { InventoryTable } from "./inventory-table";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return <InventoryTable />;
}
