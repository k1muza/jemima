"use client";

import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDelta } from "@/lib/inventory/format";
import { MOVEMENT_REASONS, type MovementReason } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";
import { useInventory, useInventoryApi } from "@/providers/inventory-store-provider";

import { buttonStyles, Segmented } from "./primitives";

type Target = { productId: string; variantId: string; size: string; label: string; qty: number };

const NOTE_REQUIRED_FOR: MovementReason[] = ["correction", "damage"];

/** Applies an adjustment and shows a toast with Undo (a reversal movement), so every surface behaves the same. */
export function useStockAdjuster() {
  const store = useInventoryApi();
  return (target: Omit<Target, "qty">, delta: number, reason: MovementReason, note = "") => {
    const result = store.getState().adjustStock(target.productId, target.variantId, target.size, delta, reason, note);
    if (!result.ok) {
      toast.error(result.error);
      return result;
    }
    const { movement } = result;
    toast(`${formatDelta(movement.delta)} · ${target.label} (now ${movement.after})`, {
      action: {
        label: "Undo",
        onClick: () => {
          const undo = store.getState().reverseMovement(movement.id);
          if (!undo.ok) toast.error(undo.error);
        },
      },
    });
    return result;
  };
}

/**
 * Lightweight "Adjust stock" control (spec §8): add/remove an amount,
 * pick a reason, optional note, confirm. Every confirm records one movement.
 */
export function AdjustStockPopover({ target, trigger }: { target: Target; trigger: ReactElement }) {
  const requireNote = useInventory((s) => s.settings.requireNoteForCorrections);
  const adjust = useStockAdjuster();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState<MovementReason>("restock");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDirection("add");
    setAmount("1");
    setReason("restock");
    setNote("");
    setError(null);
  };

  const n = parseInt(amount, 10) || 0;
  const delta = direction === "add" ? n : -n;
  const preview = target.qty + delta;

  const submit = () => {
    if (n <= 0) return setError("Enter an amount of 1 or more.");
    if (preview < 0) return setError(`Only ${target.qty} in stock.`);
    if (requireNote && NOTE_REQUIRED_FOR.includes(reason) && !note.trim()) {
      return setError("A note is required for corrections and damage.");
    }
    const result = adjust(target, delta, reason, note);
    if (result.ok) {
      setOpen(false);
      reset();
    } else {
      setError(result.error);
    }
  };

  const fieldClass = "h-9 rounded-lg border bg-card px-2.5 text-sm focus:border-foreground focus:outline-none";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="end" className="w-[290px] gap-3 rounded-[14px] p-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-2xl leading-none">Adjust stock</span>
          <span className="truncate text-xs text-subtle">{target.label}</span>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-2">
            <Segmented
              label="Direction"
              value={direction}
              onChange={(d) => {
                setDirection(d);
                setReason(d === "add" ? "restock" : "damage");
                setError(null);
              }}
              options={[
                { value: "add", label: "Add" },
                { value: "remove", label: "Remove" },
              ]}
              className="flex-nowrap"
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              aria-label="Amount"
              className={cn(fieldClass, "w-full min-w-0 text-center font-mono font-medium")}
            />
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value as MovementReason)} className={fieldClass}>
              {MOVEMENT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Note{requireNote && NOTE_REQUIRED_FOR.includes(reason) ? "" : " (optional)"}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Delivery from supplier" className={fieldClass} />
          </label>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-muted-foreground">
              {target.qty} → <span className="font-mono font-medium text-foreground">{Math.max(0, preview)}</span>
            </span>
            {error && (
              <span role="alert" className="text-right text-xs text-destructive">
                {error}
              </span>
            )}
          </div>
          <button type="submit" className={cn(buttonStyles.primary, "py-2.5")}>
            {direction === "add" ? `Add ${n || ""}` : `Remove ${n || ""}`}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
