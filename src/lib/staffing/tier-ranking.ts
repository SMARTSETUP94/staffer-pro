// v0.35.1bis — Tier ranking personnes (déterministe, pas d'IA)
// Spec : mem://features/auto-staffing-v035-spec
//
// Tier1 = CDI/CDD metier_principal_id = step.metier_id              → score base 100
// Tier2 = CDI/CDD metiers_secondaires contient step.metier_id        → score base 70
// Tier3 = Intérim                                                    → score base 30
//
// Score final = tier_base × bonus_contrat + presence_dispo_pct - penalite_polyvalence
//   bonus_contrat : CDI = 1.0, CDD = 0.9, Intérim = 0.3 (intérim = variable d'ajustement, jamais défaut)
//
// Manut polyvalent (competences_polyvalentes.{bois|metal|peinture|tap} = true) peut couvrir Tier2.

import type { MetierKey } from "./types";
import { METIER_ID } from "./types";

export type ContratType = "CDI" | "CDD" | "Interim";

export interface EmployeStaffing {
  id: string;
  nom: string;
  prenom: string;
  metier_principal_id: number;
  metiers_secondaires: number[];
  /** ex: { bois: true, metal: false, peinture: true, tap: false } */
  competences_polyvalentes: Record<string, boolean>;
  niveau_seniorite: number; // 1..5
  type_contrat: ContratType;
  actif: boolean;
  non_staffing: boolean;
}

export interface ResourceAvailabilityInput {
  date_debut: string;
  date_fin: string;
  /** Plan id à exclure (pour calculer dispo en ignorant le plan en cours d'édition) */
  exclude_plan_id?: string;
}

export interface PersonneOccupation {
  /** % occupation moyen sur la fenêtre (0..100) */
  occupation_pct_moyenne: number;
  /** Détail jour par jour */
  par_jour: Record<string, number>;
}

export interface ResourceAvailability {
  /** Réservations CNC déjà posées (cross-affaires) sur la fenêtre */
  num_machine_reserved: Set<string>;
  /** employe_id → occupation */
  personnes: Record<string, PersonneOccupation>;
  /** date → total personnes occupées (pic global) */
  pic_par_jour: Record<string, number>;
  /** date → métier → personnes */
  pic_par_metier: Record<string, Record<MetierKey, number>>;
  /** employe_id → set de dates ISO d'absence pleine journée */
  absences_par_personne?: Record<string, Set<string>>;
}

export const TIER_BASE = { 1: 100, 2: 70, 3: 30 } as const;
export const BONUS_CONTRAT: Record<ContratType, number> = { CDI: 1.0, CDD: 0.9, Interim: 0.3 };

/** Détermine le tier d'un employé pour un step donné. */
export function getTier(emp: EmployeStaffing, metierStepId: number): 1 | 2 | 3 | null {
  if (!emp.actif || emp.non_staffing) return null;
  if (emp.type_contrat === "Interim") return 3;
  if (emp.metier_principal_id === metierStepId) return 1;
  if (emp.metiers_secondaires.includes(metierStepId)) return 2;
  // Manut polyvalent → couvre Tier2 sur Bois/Metal/Peint/Tap
  if (emp.metier_principal_id === METIER_ID.Manut) {
    const polyMap: Partial<Record<number, string>> = {
      [METIER_ID.Bois]: "bois",
      [METIER_ID.Metal]: "metal",
      [METIER_ID.Peint]: "peinture",
      [METIER_ID.Tap]: "tap",
    };
    const key = polyMap[metierStepId];
    if (key && emp.competences_polyvalentes?.[key]) return 2;
  }
  return null;
}

/** Score final pour ranker les candidats sur un step.
 *  Plus haut = meilleur candidat. */
export function scoreCandidat(
  emp: EmployeStaffing,
  metierStepId: number,
  presenceDispoPct: number // 0..100 (100 = totalement libre)
): number | null {
  const tier = getTier(emp, metierStepId);
  if (tier === null) return null;
  const base = TIER_BASE[tier];
  const bonus = BONUS_CONTRAT[emp.type_contrat];
  // Séniorité : +1 par niveau (1..5) — micro tie-breaker
  const seniorite = (emp.niveau_seniorite ?? 3) - 3;
  return base * bonus + presenceDispoPct + seniorite;
}

/** Tri stable des candidats par score décroissant.
 *  Garantit : CDI Tier1 > CDD Tier1 > CDI Tier2 > CDD Tier2 > Intérim. */
export function rankCandidats(
  employes: EmployeStaffing[],
  metierStepId: number,
  occupations: Record<string, PersonneOccupation>
): Array<{ employe: EmployeStaffing; score: number; tier: 1 | 2 | 3 }> {
  const out: Array<{ employe: EmployeStaffing; score: number; tier: 1 | 2 | 3 }> = [];
  for (const emp of employes) {
    const tier = getTier(emp, metierStepId);
    if (tier === null) continue;
    const occ = occupations[emp.id];
    const dispoPct = 100 - (occ?.occupation_pct_moyenne ?? 0);
    if (dispoPct <= 0) continue; // employé saturé
    const score = scoreCandidat(emp, metierStepId, dispoPct);
    if (score === null) continue;
    out.push({ employe: emp, score, tier });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break : tier croissant, puis nom alpha (déterminisme)
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (a.employe.nom + a.employe.prenom).localeCompare(b.employe.nom + b.employe.prenom);
  });
  return out;
}
