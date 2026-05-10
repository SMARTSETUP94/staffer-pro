/**
 * v0.44.4 — Mapping des codes d'erreur business renvoyés par les triggers PostgreSQL
 * vers des messages utilisateur en français.
 *
 * Les triggers (validate_heures_saisies_bounds, validate_assignation_heures,
 * validate_contrat_intermittent) émettent un RAISE EXCEPTION dont le message
 * commence par un code métier : "HEURES_INVALIDES: ...", "TAUX_INVALIDE: ...", etc.
 *
 * Cette fonction extrait le code et produit un libellé humain ;
 * en cas de code inconnu, on retombe sur le message brut PostgreSQL.
 */

export type BusinessErrorCode =
  | "HEURES_INVALIDES"
  | "DATES_CONTRAT_INVALIDES"
  | "TAUX_INVALIDE"
  | "VOLUME_ECART_DEVIS"
  | "UNKNOWN";

const CODE_LABELS: Record<Exclude<BusinessErrorCode, "UNKNOWN">, string> = {
  HEURES_INVALIDES:
    "Heures invalides. Les heures réelles et de nuit doivent être comprises entre 0 et 24, et les heures de nuit ne peuvent excéder les heures réelles.",
  DATES_CONTRAT_INVALIDES:
    "Dates de contrat invalides. La date de fin doit être postérieure ou égale à la date de début, et la date de début ne peut être antérieure de plus de 2 ans.",
  TAUX_INVALIDE:
    "Taux horaire invalide. Le taux brut doit être strictement positif.",
  VOLUME_ECART_DEVIS:
    "Volume staffé incohérent avec le volume du devis (écart > 15%).",
};

export interface ParsedBusinessError {
  code: BusinessErrorCode;
  message: string;
  raw: string;
}

/**
 * Extrait le code métier d'un message d'erreur PostgreSQL.
 * Accepte n'importe quelle forme d'erreur Supabase / PostgrestError / Error / string.
 */
export function parseBusinessError(err: unknown): ParsedBusinessError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);

  const match = raw.match(
    /\b(HEURES_INVALIDES|DATES_CONTRAT_INVALIDES|TAUX_INVALIDE|VOLUME_ECART_DEVIS)\b/,
  );
  if (match) {
    const code = match[1] as Exclude<BusinessErrorCode, "UNKNOWN">;
    return { code, message: CODE_LABELS[code], raw };
  }
  return { code: "UNKNOWN", message: raw, raw };
}

/**
 * Helper pratique pour afficher un toast à partir d'une erreur Supabase.
 * Usage :
 *   const { error } = await supabase.from("heures_saisies").insert({...});
 *   if (error) toast.error(...formatBusinessError(error));
 */
export function formatBusinessError(err: unknown): [string, { description?: string }] {
  const parsed = parseBusinessError(err);
  if (parsed.code === "UNKNOWN") {
    return ["Erreur", { description: parsed.message }];
  }
  return [parsed.message, { description: `Code : ${parsed.code}` }];
}
