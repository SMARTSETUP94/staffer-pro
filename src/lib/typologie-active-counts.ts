/**
 * v0.29.2 — Helpers pour compter les affaires actives par typologie.
 *
 * Une affaire est considérée "active" (à compter dans les badges Planning,
 * Fabrication, Export) si :
 *   - statut ∈ {prospect, en_cours} (PAS termine, PAS annule)
 *   - ET (date_demontage IS NULL OU date_demontage >= today)
 *
 * On exclut les chantiers consommés/clos pour éviter de polluer les compteurs UI.
 */
import { getAffaireTypologie, type AffaireTypologie } from "@/lib/affaire-typologie";

export interface AffaireForTypoCount {
  numero: string;
  statut?: "prospect" | "en_cours" | "termine" | "annule" | string | null;
  date_demontage?: string | null;
}

/** Vrai si l'affaire doit être comptée comme "active". */
export function isAffaireActiveForCount(
  a: AffaireForTypoCount,
  now: Date = new Date(),
): boolean {
  if (a.statut === "termine" || a.statut === "annule") return false;
  if (a.date_demontage) {
    const d = new Date(a.date_demontage);
    const ref = new Date(now);
    ref.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if (d < ref) return false;
  }
  return true;
}

/** Renvoie un compteur typologie → nombre d'affaires actives. */
export function countActiveAffairesByTypologie(
  affaires: ReadonlyArray<AffaireForTypoCount>,
  now: Date = new Date(),
): Partial<Record<AffaireTypologie, number>> {
  const counts: Partial<Record<AffaireTypologie, number>> = {};
  affaires.forEach((a) => {
    if (!isAffaireActiveForCount(a, now)) return;
    const t = getAffaireTypologie(a.numero);
    if (t) counts[t] = (counts[t] ?? 0) + 1;
  });
  return counts;
}
