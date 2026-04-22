import { format, addDays, isBefore, isAfter } from "date-fns";
import type { Lieu } from "@/hooks/use-lieux";

/**
 * v0.18.1 — Suggestions automatiques de trajets ATELIER ↔ chantier.
 *
 * Règles :
 *  - Pour chaque affaire active dans la plage [weekStart, weekEnd] :
 *    • si `date_montage` tombe dans la semaine → suggérer 1 trajet
 *      ATELIER → adresse_chantier (catégorie "pose")
 *    • si `date_demontage` tombe dans la semaine → suggérer 1 trajet
 *      adresse_chantier → ATELIER (catégorie "depose")
 *      (le retour vers un STOCKAGE est proposé à la création, choix admin)
 *  - On exclut les suggestions s'il existe déjà un trajet ATELIER↔chantier le même jour.
 */

export interface AffaireSuggest {
  id: string;
  numero: string;
  nom: string;
  lieu: string | null;
  date_montage: string | null;
  date_demontage: string | null;
}

export interface TrajetExistant {
  affaire_id: string | null;
  date: string;
  adresse_depart: string;
  adresse_arrivee: string;
}

export type SuggestionType = "montage" | "demontage";

export interface TrajetSuggestion {
  id: string; // pseudo-id pour key React (affaire-type-date)
  affaire: AffaireSuggest;
  type: SuggestionType;
  date: string; // yyyy-MM-dd
  adresse_depart: string;
  adresse_arrivee: string;
  /** Stockages alternatifs proposés (uniquement pour le démontage). */
  alternatives_arrivee?: { id: string; label: string; adresse: string }[];
}

function dansSemaine(d: string | null, weekStart: Date, weekEnd: Date): boolean {
  if (!d) return false;
  const ws = format(weekStart, "yyyy-MM-dd");
  const we = format(weekEnd, "yyyy-MM-dd");
  return d >= ws && d <= we;
}

function aDejaTrajet(
  trajets: TrajetExistant[],
  affaire_id: string,
  date: string,
  ateliersAdresse: string,
  chantierAdresse: string,
): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  return trajets.some((t) => {
    if (t.date !== date) return false;
    if (t.affaire_id !== affaire_id) return false;
    const dep = norm(t.adresse_depart);
    const arr = norm(t.adresse_arrivee);
    const at = norm(ateliersAdresse);
    const ch = norm(chantierAdresse);
    return (dep === at && arr === ch) || (dep === ch && arr === at);
  });
}

export function buildSuggestions(args: {
  weekStart: Date;
  weekEnd: Date;
  affaires: AffaireSuggest[];
  trajets: TrajetExistant[];
  atelier: Lieu | null;
  stockages: Lieu[];
}): TrajetSuggestion[] {
  const { weekStart, weekEnd, affaires, trajets, atelier, stockages } = args;
  if (!atelier) return [];

  const out: TrajetSuggestion[] = [];
  const stockAlts = stockages.map((s) => ({ id: s.id, label: s.label, adresse: s.adresse_complete }));

  for (const aff of affaires) {
    if (!aff.lieu || !aff.lieu.trim()) continue;

    if (dansSemaine(aff.date_montage, weekStart, weekEnd) && aff.date_montage) {
      if (!aDejaTrajet(trajets, aff.id, aff.date_montage, atelier.adresse_complete, aff.lieu)) {
        out.push({
          id: `sugg-${aff.id}-montage-${aff.date_montage}`,
          affaire: aff,
          type: "montage",
          date: aff.date_montage,
          adresse_depart: atelier.adresse_complete,
          adresse_arrivee: aff.lieu,
        });
      }
    }
    if (dansSemaine(aff.date_demontage, weekStart, weekEnd) && aff.date_demontage) {
      if (!aDejaTrajet(trajets, aff.id, aff.date_demontage, atelier.adresse_complete, aff.lieu)) {
        out.push({
          id: `sugg-${aff.id}-demontage-${aff.date_demontage}`,
          affaire: aff,
          type: "demontage",
          date: aff.date_demontage,
          adresse_depart: aff.lieu,
          adresse_arrivee: atelier.adresse_complete,
          alternatives_arrivee: stockAlts,
        });
      }
    }
  }

  // Tri chronologique
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
