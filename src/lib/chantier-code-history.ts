export interface ChantierCodeHistory {
  numero: string;
  code_opportunite: string | null;
}

export function originalOpportunityCode(row: ChantierCodeHistory): string | null {
  if (/^9\d{3}$/.test(row.code_opportunite ?? "")) return row.code_opportunite;
  return /^9\d{3}$/.test(row.numero) ? row.numero : null;
}

export function chantierCodeLabel(row: ChantierCodeHistory): string {
  const original = originalOpportunityCode(row);
  return original && original !== row.numero ? `${original} → ${row.numero}` : row.numero;
}

export function compareChantierChronology(a: ChantierCodeHistory, b: ChantierCodeHistory): number {
  return Number(originalOpportunityCode(b) ?? b.numero) - Number(originalOpportunityCode(a) ?? a.numero);
}

export function matchesChantierCodeFilter(row: ChantierCodeHistory, filter: "tous" | "4" | "6" | "9"): boolean {
  return filter === "tous" || (filter === "9" ? originalOpportunityCode(row) !== null : row.numero.startsWith(filter));
}