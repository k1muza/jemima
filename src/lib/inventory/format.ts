const intFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatNumber = (n: number) => intFormat.format(Math.round(n));

/** $1,240 for whole dollars, $12.50 otherwise. */
export function formatMoney(cents: number) {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

export const formatPercent = (ratio: number | null) =>
  ratio == null || !Number.isFinite(ratio) ? "—" : `${Math.round(ratio * 100)}%`;

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Dollars typed by a user → integer cents (never floating-point money). */
export function dollarsToCents(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (!/^\d*(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToDollars(cents: number) {
  if (!cents) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "17 Oct, 14:05" */
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
/** "17 Oct 2026" */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

export const formatDelta = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));
