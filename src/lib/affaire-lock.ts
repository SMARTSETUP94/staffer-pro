/**
 * v0.21.0 Bloc 4 — Verrouillage des affaires terminees / annulees.
 *
 * Strategie alignee sur le helper SQL `is_affaire_open` + `can_saisie_on_affaire` :
 *   - statut 'annule' : aucune action possible (sauf admin override applicatif)
 *   - statut 'termine' : aucune nouvelle assignation/objet/trajet
 *     mais saisies d'heures autorisees jusqu'a date_demontage incluse (Option B).
 *     Si date_demontage est NULL, fallback strict (refus).
 *   - autres statuts (prospect, en_cours) : tout est autorise.
 */

import type { Database } from "@/integrations/supabase/types";

export type AffaireStatut = Database["public"]["Enums"]["affaire_statut"];

export interface AffaireLockInfo {
  statut: AffaireStatut;
  date_demontage: string | null;
}

/**
 * Une affaire est-elle selectionnable pour staffing / nouvelle assignation /
 * creation d'objet fab / trajet ? (= statut != termine && != annule)
 */
export function isAffaireSelectable(affaire: Pick<AffaireLockInfo, "statut">): boolean {
  return affaire.statut !== "termine" && affaire.statut !== "annule";
}

/**
 * Saisie d'heures autorisee sur cette affaire pour cette date ? (Option B)
 * @param affaire infos minimales requises
 * @param date date jour de la saisie (string yyyy-MM-dd ou Date)
 */
export function canSaisieOnAffaire(
  affaire: AffaireLockInfo,
  date: string | Date,
): boolean {
  if (affaire.statut === "annule") return false;
  if (affaire.statut !== "termine") return true;
  // statut termine : besoin de date_demontage et date <= date_demontage
  if (!affaire.date_demontage) return false; // fallback strict
  const dateStr = typeof date === "string" ? date : toISODate(date);
  return dateStr <= affaire.date_demontage;
}

/**
 * Message utilisateur pour expliquer pourquoi une action est bloquee.
 */
export function affaireLockReason(
  affaire: AffaireLockInfo,
  date?: string | Date,
): string | null {
  if (affaire.statut === "annule") {
    return "Cette affaire est annulée. Aucune action n'est possible.";
  }
  if (affaire.statut === "termine") {
    if (!date) {
      return "Cette affaire est clôturée. Réouvrez-la pour la modifier.";
    }
    if (canSaisieOnAffaire(affaire, date)) return null;
    return affaire.date_demontage
      ? `Cette affaire est clôturée depuis le ${formatFr(affaire.date_demontage)}. Saisie impossible après cette date.`
      : "Cette affaire est clôturée et n'a pas de date de démontage. Contactez un administrateur.";
  }
  return null;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
