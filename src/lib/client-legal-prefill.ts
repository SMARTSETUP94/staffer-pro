export type ClientLegalFields = { siret: string | null; adresse: string | null; site_web: string | null };

export function sirenFromIdentifier(value: string | null): string | null {
  const digits = value?.replace(/\s/g, "") ?? "";
  return /^\d{9}(\d{5})?$/.test(digits) ? digits.slice(0, 9) : null;
}

export function prefillClientLegal(current: ClientLegalFields, suggestion: ClientLegalFields): ClientLegalFields {
  return {
    siret: current.siret?.trim() || (sirenFromIdentifier(suggestion.siret) ? suggestion.siret?.replace(/\s/g, "") ?? null : null),
    adresse: current.adresse?.trim() || suggestion.adresse?.trim() || null,
    site_web: current.site_web?.trim() || suggestion.site_web?.trim() || null,
  };
}