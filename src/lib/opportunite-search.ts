import { normalizeForMatch } from "@/lib/string-normalize";

export function matchesOpportunityKeywords(values: (string | null | undefined)[], query: string): boolean {
  const haystack = normalizeForMatch(values.filter(Boolean).join(" "));
  return normalizeForMatch(query).split(" ").every((word) => haystack.includes(word));
}

export interface ChantierSuggestion {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  client_id: string | null;
  lieu: string | null;
}

export function filterChantierSuggestions(rows: ChantierSuggestion[], query: string, clientId: string | null) {
  return rows.filter((row) => matchesOpportunityKeywords([row.numero, row.nom, row.client, row.lieu], query))
    .sort((a, b) => Number(b.client_id === clientId && clientId !== null) - Number(a.client_id === clientId && clientId !== null)
      || b.numero.localeCompare(a.numero, "fr", { numeric: true }));
}