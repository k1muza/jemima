type Cell = string | number | null | undefined;

function escapeCell(cell: Cell) {
  if (cell == null) return "";
  if (typeof cell === "number") return String(cell);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of text).
  const text = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]) {
  return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Trigger a browser download of a CSV file. */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  // BOM so Excel opens UTF-8 (e.g. "·", "£") correctly.
  const blob = new Blob(["﻿" + toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Dollars with two decimals, for CSV money columns. */
export const csvMoney = (cents: number) => (cents / 100).toFixed(2);

export const csvDate = () => new Date().toISOString().slice(0, 10);
