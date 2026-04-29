/**
 * v0.25.2 — Helpers purs pour le bulk-assign rôles à l'import devis Progbat.
 *
 * - Détection des métiers actifs (au moins 1 objet sélectionné avec heures > 0)
 * - Construction du payload `_bulk_assign` pour la RPC v3
 */
import type { FabMetier } from "@/hooks/use-fabrication";

export type EtapeKey = "be" | "usinage" | "respo_fab" | "finition" | "manutention";

/** Profil pour le filtre des dropdowns */
export interface AssignableProfile {
  id: string;
  full_name: string | null;
  email: string;
}

/** Sélections faites dans l'étape 5 */
export interface BulkAssignSelections {
  chefProjetId: string | null;
  montageId: string | null;
  demontageId: string | null;
  parEtape: Record<EtapeKey, string | null>;
}

export const EMPTY_BULK_ASSIGN: BulkAssignSelections = {
  chefProjetId: null,
  montageId: null,
  demontageId: null,
  parEtape: {
    be: null,
    usinage: null,
    respo_fab: null,
    finition: null,
    manutention: null,
  },
};

/** Objet sélectionné pour import (heures par métier) */
export interface SelectedObjetForBulk {
  selected: boolean;
  heures: Record<FabMetier, number>;
}

/**
 * Renvoie la liste des étapes pour lesquelles AU MOINS UN objet sélectionné
 * a des heures prévues > 0 sur le(s) métier(s) correspondant(s).
 * Sert à masquer les dropdowns inutiles.
 */
export function activeEtapesFromObjets(objets: SelectedObjetForBulk[]): Set<EtapeKey> {
  const active = new Set<EtapeKey>();
  for (const o of objets) {
    if (!o.selected) continue;
    if ((o.heures.be ?? 0) > 0) active.add("be");
    if ((o.heures.numerique ?? 0) > 0) active.add("usinage");
    if ((o.heures.bois ?? 0) + (o.heures.metal ?? 0) > 0) active.add("respo_fab");
    if ((o.heures.peinture ?? 0) + (o.heures.tapisserie ?? 0) > 0) active.add("finition");
    if ((o.heures.manutention ?? 0) > 0) active.add("manutention");
  }
  return active;
}

/**
 * Construit le payload `_bulk_assign` pour la RPC v3.
 * Renvoie `{}` si aucune sélection (-> v3 se comporte comme v2).
 */
export function buildBulkAssignPayload(sel: BulkAssignSelections): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (sel.chefProjetId) payload.chef_projet_id = sel.chefProjetId;
  if (sel.montageId) payload.montage_id = sel.montageId;
  if (sel.demontageId) payload.demontage_id = sel.demontageId;

  const parEtape: Record<string, string> = {};
  (Object.keys(sel.parEtape) as EtapeKey[]).forEach((k) => {
    const v = sel.parEtape[k];
    if (v) parEtape[k] = v;
  });
  if (Object.keys(parEtape).length > 0) payload.par_etape = parEtape;

  return payload;
}

/** Helper d'affichage : nom complet ou email */
export function profileLabel(p: AssignableProfile): string {
  return p.full_name?.trim() || p.email;
}
