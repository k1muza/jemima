"use client";

import { formatDateTime, formatDelta } from "@/lib/inventory/format";
import { reasonLabel, type Product, type StockMovement } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";

/** Stock history rows: when, who, why, and before → after. */
export function MovementList({
  movements,
  products,
  showItem = true,
  empty = "No stock changes yet.",
}: {
  movements: StockMovement[];
  /** Used to label which item each movement belongs to. */
  products: Product[];
  showItem?: boolean;
  empty?: string;
}) {
  if (!movements.length) return <p className="px-[22px] py-6 text-sm text-subtle">{empty}</p>;

  const byId = new Map(products.map((p) => [p.id, p]));
  return (
    <ol className="flex flex-col">
      {movements.map((m) => {
        const product = byId.get(m.productId) ?? (m.productName ? ({ name: m.productName } as Product) : undefined);
        const liveVariant = byId.get(m.productId)?.variants.find((v) => v.id === m.variantId);
        // Fall back to the names saved with the movement when the colour row was removed.
        const variant = liveVariant ?? (m.colourName ? { colourName: m.colourName, style: m.styleLabel ?? "" } : undefined);
        return (
          <li
            key={m.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-t border-line-soft px-[22px] py-3"
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {showItem ? (
                <>
                  {product?.name || "Deleted product"}
                  <span className="font-normal text-subtle">
                    {" · "}
                    {variant ? variant.colourName + (variant.style ? ` ${variant.style}` : "") : "removed colour"} · {m.size}
                  </span>
                </>
              ) : (
                <>
                  {variant?.colourName ?? "Removed colour"}
                  {variant?.style && <span className="font-normal text-subtle"> · {variant.style}</span>}
                  <span className="font-mono font-normal text-subtle"> · {m.size}</span>
                </>
              )}
            </span>
            <span
              className={cn("row-span-2 text-right font-mono text-sm font-medium", m.delta > 0 ? "text-ok-fg" : "text-out-fg")}
              aria-label={`${m.delta > 0 ? "Added" : "Removed"} ${Math.abs(m.delta)}`}
            >
              {formatDelta(m.delta)}
              <span className="block text-[11px] font-normal text-subtle">
                {m.before} → {m.after}
              </span>
            </span>
            <span className="min-w-0 truncate text-xs text-subtle">
              {reasonLabel(m.reason)}
              {m.note && ` — ${m.note}`} · {m.actor} · {formatDateTime(m.at)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
