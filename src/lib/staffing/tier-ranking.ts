// v0.35.x — Tier ranking personnes 4 niveaux (déterministe, pas d'IA)
// Spec : mem://features/competences-4-niveaux
//
// Niveaux compétence (par employé × métier) :
//   - Principal     (employes.metier_principal_id)
//   - Secondaire    (employe_metiers.niveau = 'secondaire')
//   - Dépannage     (employe_metiers.niveau = 'depannage')
//   - Bloqué        (employe_metiers.niveau = 'bloque')   → exclu
//
// Tiers calculés :
//   Tier 1 = CDI/CDD Principal           → score base 100
//   Tier 2 = CDI/CDD Secondaire          → score base 70
//   Tier 3 = Intermittent (Principal/Secondaire) → score base 30
//   Tier 4 = CDI/CDD Dépannage           → score base 10  (dernier recours, après intermittent)
//
// Bonus contrat : CDI 1.0, CDD 0.9, Intermittent 0.3.
// Manut polyvalent (competences_polyvalentes.{bois|metal|peinture|tap}=true) → équivaut Tier 2 (Secondaire)
// pour le métier couvert.

import type { MetierKey } from "./types";
import { METIER_ID } from "./types";

export type ContratType = "CDI" | "CDD" | "Interim";
export type CompetenceNiveau = "secondaire" | "depannage" | "bloque";

export interface EmployeStaffing {
  id: string;
  nom: string;
  prenom: string;
  metier_principal_id: number;
  /** Conservé pour compat (lecture rapide) — synchronisé avec niveaux_par_metier */
  metiers_secondaires: number[];
  /** metier_id → niveau ('secondaire' | 'depannage' | 'bloque') pour les non-principaux. */
  niveaux_par_metier?: Record<number, CompetenceNiveau>;
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
  exclude_plan_id?: string;
}

export interface PersonneOccupation {
  occupation_pct_moyenne: number;
  par_jour: Record<string, number>;
}

export interface ResourceAvailability {
  num_machine_reserved: Set<string>;
  personnes: Record<string, PersonneOccupation>;
  pic_par_jour: Record<string, number>;
  pic_par_metier: Record<string, Record<MetierKey, number>>;
  absences_par_personne?: Record<string, Set<string>>;
}

export const TIER_BASE = { 1: 100, 2: 70, 3: 30, 4: 10 } as const;
export const BONUS_CONTRAT: Record<ContratType, number> = { CDI: 1.0, CDD: 0.9, Interim: 0.3 };

/** Lit le niveau d'un employé pour un métier non-principal. */
function getNiveau(emp: EmployeStaffing, metierStepId: number): CompetenceNiveau | null {
  const map = emp.niveaux_par_metier;
  if (map && map[metierStepId]) return map[metierStepId];
  // Fallback compat : si listé dans metiers_secondaires sans niveau explicite → secondaire
  if (emp.metiers_secondaires.includes(metierStepId)) return "secondaire";
  return null;
}

/** Détermine le tier d'un employé pour un step donné (1..4) ou null si exclu. */
export function getTier(emp: EmployeStaffing, metierStepId: number): 1 | 2 | 3 | 4 | null {
  if (!emp.actif || emp.non_staffing) return null;

  // Principal : 1 (CDI/CDD) ou 3 (Intermittent)
  if (emp.metier_principal_id === metierStepId) {
    return emp.type_contrat === "Interim" ? 3 : 1;
  }

  // Bloqué explicitement → exclu
  const niveau = getNiveau(emp, metierStepId);
  if (niveau === "bloque") return null;

  if (niveau === "secondaire") {
    return emp.type_contrat === "Interim" ? 3 : 2;
  }
  if (niveau === "depannage") {
    // CDI/CDD seulement, intermittent "dépannage" = aucun sens (intermittent déjà variable d'ajustement)
    return emp.type_contrat === "Interim" ? null : 4;
  }

  // Manut polyvalent → équivalent Secondaire (Tier 2 si CDI/CDD, Tier 3 si Intermittent)
  if (emp.metier_principal_id === METIER_ID.Manut) {
    const polyMap: Partial<Record<number, string>> = {
      [METIER_ID.Bois]: "bois",
      [METIER_ID.Metal]: "metal",
      [METIER_ID.Peint]: "peinture",
      [METIER_ID.Tap]: "tap",
    };
    const key = polyMap[metierStepId];
    if (key && emp.competences_polyvalentes?.[key]) {
      return emp.type_contrat === "Interim" ? 3 : 2;
    }
  }

  return null;
}

export function scoreCandidat(
  emp: EmployeStaffing,
  metierStepId: number,
  presenceDispoPct: number
): number | null {
  const tier = getTier(emp, metierStepId);
  if (tier === null) return null;
  const base = TIER_BASE[tier];
  const bonus = BONUS_CONTRAT[emp.type_contrat];
  const seniorite = (emp.niveau_seniorite ?? 3) - 3;
  return base * bonus + presenceDispoPct + seniorite;
}

export function rankCandidats(
  employes: EmployeStaffing[],
  metierStepId: number,
  occupations: Record<string, PersonneOccupation>
): Array<{ employe: EmployeStaffing; score: number; tier: 1 | 2 | 3 | 4 }> {
  const out: Array<{ employe: EmployeStaffing; score: number; tier: 1 | 2 | 3 | 4 }> = [];
  for (const emp of employes) {
    const tier = getTier(emp, metierStepId);
    if (tier === null) continue;
    const occ = occupations[emp.id];
    const dispoPct = 100 - (occ?.occupation_pct_moyenne ?? 0);
    if (dispoPct <= 0) continue;
    const score = scoreCandidat(emp, metierStepId, dispoPct);
    if (score === null) continue;
    out.push({ employe: emp, score, tier });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (a.employe.nom + a.employe.prenom).localeCompare(b.employe.nom + b.employe.prenom);
  });
  return out;
}
