/**
 * v0.24.1 — Helpers triviaux extraits de trajets-soustraitance-export.ts
 * pour permettre le lazy-loading de xlsx (~300KB) sans pull du module entier.
 */

import type { TrajetExportRow, TrajetExportFilters } from "./trajets-soustraitance-export";

export type { TrajetExportRow, TrajetExportFilters };

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildExportFilename(
  ext: "csv" | "xlsx",
  filters: TrajetExportFilters,
): string {
  const parts: string[] = ["trajets-soustraitance"];
  if (filters.dateFrom) parts.push(filters.dateFrom);
  if (filters.dateTo && filters.dateTo !== filters.dateFrom) parts.push(filters.dateTo);
  return `${parts.join("_")}.${ext}`;
}
