"use client";

import { useState, type ComponentProps } from "react";

import { centsToDollars, dollarsToCents } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";

const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  const input = e.currentTarget;
  // Defer so the click that focused the input doesn't clear the selection.
  setTimeout(() => input.select(), 0);
};

/**
 * Whole-number stock input. Blank is allowed while typing (stored as null,
 * counted as 0); arrow keys nudge the value.
 */
export function QtyInput({
  value,
  onValue,
  className,
  ...props
}: { value: number | null; onValue: (qty: number | null) => void } & Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type"
>) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={value ?? ""}
      onFocus={selectOnFocus}
      onChange={(e) => {
        const text = e.target.value;
        onValue(text === "" ? null : Math.max(0, parseInt(text, 10) || 0));
      }}
      className={cn(
        "h-10 w-full rounded-lg border text-center font-mono text-sm font-medium transition-colors focus:border-foreground focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * USD amount stored as integer cents. Keeps the typed text locally so
 * partial input like "12." survives, and resyncs when the value changes elsewhere.
 */
export function MoneyInput({
  cents,
  onCents,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  ...props
}: {
  cents: number;
  onCents: (cents: number) => void;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "className">) {
  const [text, setText] = useState(() => centsToDollars(cents));
  const [syncedCents, setSyncedCents] = useState(cents);

  // Adopt outside changes (React's "adjust state during render" pattern).
  if (cents !== syncedCents) {
    setSyncedCents(cents);
    if (dollarsToCents(text) !== cents) setText(centsToDollars(cents));
  }

  return (
    <span className={cn("flex items-center gap-1.5 rounded-lg border bg-card focus-within:border-foreground", className)}>
      <span className="text-subtle">$</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        aria-label={ariaLabel}
        value={text}
        onFocus={selectOnFocus}
        onChange={(e) => {
          const next = e.target.value;
          const parsed = dollarsToCents(next);
          if (parsed === null) return; // reject non-money input
          setText(next);
          setSyncedCents(parsed);
          onCents(parsed);
        }}
        onBlur={() => setText(centsToDollars(cents))}
        className={cn("w-full min-w-0 border-none bg-transparent tabular-nums outline-none", inputClassName)}
        {...props}
      />
    </span>
  );
}
