import type { CSSProperties, ReactNode } from "react";

import { luminance } from "@/lib/inventory/colour";
import type { CellLevel } from "@/lib/inventory/stock";
import type { StockStatus } from "@/lib/inventory/types";
import { cn } from "@/lib/utils";

/** Round colour dot. Always pair with a visible name or a title. */
export function Swatch({ hex, title, className }: { hex: string; title?: string; className?: string }) {
  return (
    <span
      title={title}
      aria-hidden={!title}
      className={cn("inline-block size-3.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.14)]", className)}
      style={{ background: hex }}
    />
  );
}

/** Photo, or a striped swatch-coloured placeholder when there's no image yet. */
export function photoBackground(hex: string | undefined, imageUrl?: string): CSSProperties {
  if (imageUrl) return { background: `center / cover no-repeat url("${imageUrl}")` };
  return {
    background: `repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 10px, rgba(0,0,0,0) 10px 20px), ${hex || "#d9d1c4"}`,
  };
}

export const placeholderInk = (hex: string | undefined) =>
  luminance(hex || "#d9d1c4") > 0.6 ? "rgba(26,23,20,.5)" : "rgba(255,253,249,.7)";

export function PhotoFill({
  hex,
  imageUrl,
  label,
  className,
  children,
}: {
  hex?: string;
  imageUrl?: string;
  /** Shown on the placeholder, e.g. "no photos yet". */
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={photoBackground(hex, imageUrl)}>
      {!imageUrl && label && (
        <span
          className="absolute inset-0 flex items-center justify-center font-mono text-[11px]"
          style={{ color: placeholderInk(hex) }}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

const STATUS_CLASSES: Record<StockStatus, string> = {
  "In stock": "bg-ok-bg text-ok-fg",
  "Low stock": "bg-low-bg text-low-fg",
  "Out of stock": "bg-out-bg text-out-fg",
};

export const statusTextClass: Record<StockStatus, string> = {
  "In stock": "text-muted-foreground",
  "Low stock": "text-low-fg",
  "Out of stock": "text-out-fg",
};

export function StatusBadge({ status, className }: { status: StockStatus; className?: string }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CLASSES[status], className)}>
      {status}
    </span>
  );
}

/** Input colours for a stock cell. Status is also exposed via title/aria for non-colour cues. */
export const cellLevelClasses: Record<CellLevel, string> = {
  ok: "border-border bg-card text-foreground",
  low: "border-low-line bg-low-bg text-low-fg",
  out: "border-out-line bg-out-bg text-out-fg",
};

export const cellLevelLabel: Record<CellLevel, string> = {
  ok: "in stock",
  low: "low stock",
  out: "sold out",
};

/** Pill-style segmented control from the design. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  itemClassName,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-0.5 rounded-[9px] bg-muted p-[3px]", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-[7px] px-3 py-[7px] text-[13px] font-medium transition-colors",
              on ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "hover:bg-card/50",
              itemClassName,
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="font-normal text-subtle">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow: ReactNode; title: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className="font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase">{eyebrow}</div>
        <h1 className="font-serif text-5xl leading-[0.95] tracking-[-0.02em] md:text-[64px]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[14px] border bg-card", className)}>{children}</section>;
}

export function PanelTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("font-serif text-[28px] leading-tight font-normal", className)}>{children}</h2>;
}

/** Design button styles (charcoal primary / ivory outline). */
export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center whitespace-nowrap rounded-[9px] bg-primary px-[18px] py-[11px] text-sm font-medium text-primary-foreground transition-colors hover:bg-[#3a332c] disabled:opacity-50",
  outline:
    "inline-flex items-center justify-center whitespace-nowrap rounded-[9px] border border-strong-line bg-card px-4 py-[11px] text-sm font-medium transition-colors hover:border-foreground disabled:opacity-50",
};
