/**
 * v0.29.0 — Helpers purs pour AssignationBulkObjetDialog (staffing bulk sur objet).
 *
 * Logique :
 *  - Calcul des métiers disponibles pour un objet (heures_prevues_X > 0)
 *  - Filtrage employés par métier (par metier_principal + flag rôle)
 *  - Calcul total heures à créer (n_emp × n_jours × heures_par_jour)
 *  - Score budget restant + statut couleur (vert/jaune/rouge)
 */

import type { Slot } from "@/lib/bulk-staffer";
import {
  METIER_CODE_TO_HEURES_KEY,
  type HeuresPrevuesKey,
  type MetierLite,
  type ObjetHeuresPrevues,
} from "@/lib/objet-heures-helpers";

/** Profil employé minimal utilisé par le dialog. */
export interface EmployeForBulk {
  id: string;
  prenom: string;
  nom: string;
  actif: boolean;
  metier_principal_id: number;
  est_bureau_etude?: boolean | null;
  est_usinage_numerique?: boolean | null;
  est_finition?: boolean | null;
  est_manutention?: boolean | null;
  est_respo_fab?: boolean | null;
}

/** Liste les métiers où l'objet a heures_prevues_X > 0. Préserve le type d'entrée. */
export function metiersDisponiblesForObjet<M extends MetierLite>(
  objet: ObjetHeuresPrevues,
  metiers: M[],
): M[] {
  return metiers.filter((m) => {
    const k = METIER_CODE_TO_HEURES_KEY[m.code];
    if (!k) return false;
    const col = `heures_prevues_${k}` as keyof ObjetHeuresPrevues;
    return Number(objet[col] ?? 0) > 0;
  });
}

/**
 * Filtre employés par compatibilité métier :
 *  - metier_principal_id == metierId  → toujours retenu
 *  - flag rôle correspondant au code métier (ex peinture/tapisserie/bois → est_finition)
 *
 * Mapping flag :
 *   suivi_projet  → est_bureau_etude
 *   numerique     → est_usinage_numerique
 *   logistique    → est_manutention
 *   peinture, tapisserie, construction, metallerie → metier_principal uniquement
 */
export function employesForMetier(
  employes: EmployeForBulk[],
  metierId: number,
  metiers: MetierLite[],
): EmployeForBulk[] {
  const m = metiers.find((x) => x.id === metierId);
  if (!m) return [];
  const flagCheck = flagForMetierCode(m.code);
  return employes
    .filter((e) => {
      if (e.metier_principal_id === metierId) return true;
      if (flagCheck && flagCheck(e)) return true;
      return false;
    })
    .sort((a, b) => {
      if (a.actif !== b.actif) return a.actif ? -1 : 1;
      return `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr");
    });
}

function flagForMetierCode(
  code: string,
): ((e: EmployeForBulk) => boolean) | null {
  switch (code) {
    case "suivi_projet":
      return (e) => !!e.est_bureau_etude;
    case "numerique":
      return (e) => !!e.est_usinage_numerique;
    case "logistique":
      return (e) => !!e.est_manutention;
    default:
      return null;
  }
}

/** Heures par défaut selon créneau (cohérent avec bulk-staffer). */
export function heuresForSlot(slot: Slot, custom?: number): number {
  if (slot === "JOURNEE") return custom ?? 8;
  return custom ?? 4;
}

/**
 * Calcule le total d'heures à créer.
 * `nbEmployes` × `nbJours` × `heuresParJour`.
 */
export function computeTotalHeures(
  nbEmployes: number,
  nbJours: number,
  heuresParJour: number,
): number {
  if (nbEmployes <= 0 || nbJours <= 0 || heuresParJour <= 0) return 0;
  return Math.round(nbEmployes * nbJours * heuresParJour * 100) / 100;
}

/**
 * Heures déjà staffées sur un objet pour un métier donné.
 * Lit la liste des assignations liées à l'objet.
 */
export function heuresDejaStaffeesForObjet(params: {
  objetId: string;
  metierId: number;
  links: ReadonlyArray<{ assignation_id: string; objet_id: string }>;
  assignations: ReadonlyArray<{ id: string; metier_id: number; heures: number }>;
}): number {
  const { objetId, metierId, links, assignations } = params;
  const ids = new Set(
    links.filter((l) => l.objet_id === objetId).map((l) => l.assignation_id),
  );
  return assignations
    .filter((a) => ids.has(a.id) && a.metier_id === metierId)
    .reduce((s, a) => s + Number(a.heures || 0), 0);
}

/**
 * Heures prévues pour 1 métier sur 1 objet, en tenant compte de la quantité.
 */
export function heuresPrevuesForMetier(
  objet: ObjetHeuresPrevues,
  metierId: number,
  metiers: MetierLite[],
): number {
  const m = metiers.find((x) => x.id === metierId);
  if (!m) return 0;
  const k = METIER_CODE_TO_HEURES_KEY[m.code];
  if (!k) return 0;
  const col = `heures_prevues_${k}` as keyof ObjetHeuresPrevues;
  const unit = Number(objet[col] ?? 0) || 0;
  const qte = Number(objet.quantite ?? 1) || 1;
  return unit * qte;
}

/** Statut couleur du récap budget. */
export type BudgetStatus = "ok" | "warn" | "danger" | "no-budget";

export function budgetStatus(params: {
  totalHeuresAjout: number;
  heuresDejaStaffees: number;
  heuresPrevues: number;
}): BudgetStatus {
  const { totalHeuresAjout, heuresDejaStaffees, heuresPrevues } = params;
  if (heuresPrevues <= 0) return "no-budget";
  const apres = heuresDejaStaffees + totalHeuresAjout;
  if (apres <= heuresPrevues) return "ok";
  const ratio = (apres - heuresPrevues) / heuresPrevues;
  if (ratio <= 0.2) return "warn";
  return "danger";
}

/** Util : auto-suggestion métier (un seul disponible → sélectionné). */
export function autoSuggestMetier<M extends MetierLite>(
  metiersDispo: M[],
): number | null {
  if (metiersDispo.length === 1) return metiersDispo[0].id;
  return null;
}

export type { Slot, HeuresPrevuesKey };
