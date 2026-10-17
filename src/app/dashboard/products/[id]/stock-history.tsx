"use client";

import Link from "next/link";

import { MovementList } from "@/components/inventory/movement-list";
import { Panel } from "@/components/inventory/primitives";
import { plural } from "@/lib/inventory/format";
import type { Product } from "@/lib/inventory/types";
import { useInventory } from "@/providers/inventory-store-provider";

const SHOWN = 8;

/** Spec §6: stock history with date, actor, reason and before/after counts. */
export function StockHistory({ product }: { product: Product }) {
  const allMovements = useInventory((s) => s.movements);
  const movements = allMovements.filter((m) => m.productId === product.id);

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-[30px] font-normal">Stock history</h2>
          <span className="text-xs text-subtle">
            {movements.length ? `${plural(movements.length, "change")} recorded. History is never edited; undoing adds a reversal.` : "Every quantity change will be listed here."}
          </span>
        </div>
        <Link href="/dashboard/inventory" className="text-[13px] font-medium text-muted-foreground underline-offset-4 hover:underline">
          Adjust in Inventory →
        </Link>
      </div>
      <Panel className="overflow-hidden [&_li:first-child]:border-t-0">
        <MovementList showItem={false} products={[product]} movements={movements.slice(0, SHOWN)} empty="No stock changes for this product yet." />
      </Panel>
      {movements.length > SHOWN && (
        <span className="text-xs text-subtle">Showing the latest {SHOWN}. Open an item in Inventory to see its full history.</span>
      )}
    </section>
  );
}
