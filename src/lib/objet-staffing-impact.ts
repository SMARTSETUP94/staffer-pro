/**
 * Simulation E2E de l'agrégation `v_devis_consommation` pour une affaire.
 *
 * Cette vue Supabase n'est pas testable côté client ; on la reproduit ici pour
 * vérifier le scénario complet :
 *   - création d'objets de fabrication
 *   - création d'assignations rattachées à ces objets (assignation_objets)
 *   - saisie d'heures sur ces objets (fabrication_objet_id sur heures_saisies)
 *   - le récap par (devis, métier) reflète bien staff & réalisé.
 *
 * Convention identique à la vue Supabase :
 *   - heures_assignees      = SUM(assignations.heures) groupé par (devis, métier)
 *   - heures_reelles_validees = SUM(heures_saisies WHERE statut = 'valide')
 *   - heures_reelles_soumises = SUM(heures_saisies WHERE statut IN ('soumis','brouillon'))
 *   - heures_prevues        = SUM(devis_postes.heures_prevues)
 *
 * Les objets eux-mêmes ne sont pas une dimension du récap : ils enrichissent
 * la traçabilité (qui staffe quoi) mais les heures restent agrégées au niveau
 * (devis, métier).
 */

import type { ConsoLineInput } from "./affaire-recap-heures";

export interface DevisPosteFixture {
  devis_id: string;
  devis_numero: string;
  metier_id: number;
  metier: string;
  couleur: string;
  heures_prevues: number;
}

export interface ObjetFixture {
  id: string;
  affaire_id: string;
  reference: string;
  nom: string;
  archive?: boolean;
}

export interface AssignationFixture {
  id: string;
  affaire_id: string;
  devis_id: string | null;
  metier_id: number;
  heures: number;
}

export interface AssignationObjetFixture {
  assignation_id: string;
  objet_id: string;
}

export type HeuresStatut = "brouillon" | "soumis" | "valide" | "rejete";

export interface HeureSaisieFixture {
  id: string;
  affaire_id: string;
  devis_id: string | null;
  fabrication_objet_id: string | null;
  /** Métier déterminé à la saisie : on prend par défaut celui de l'assignation. */
  metier_id: number;
  heures_reelles: number;
  statut: HeuresStatut;
}

export interface AffaireFixture {
  affaire_id: string;
  postes: DevisPosteFixture[];
  objets: ObjetFixture[];
  assignations: AssignationFixture[];
  assignation_objets: AssignationObjetFixture[];
  heures_saisies: HeureSaisieFixture[];
}

/** Reproduit `v_devis_consommation` côté JS pour une affaire. */
export function aggregateConsommation(fixture: AffaireFixture): ConsoLineInput[] {
  const key = (devisId: string | null, metierId: number) =>
    `${devisId ?? "null"}::${metierId}`;

  const map = new Map<string, ConsoLineInput>();

  // Initialise depuis les postes (budget devis)
  for (const p of fixture.postes) {
    map.set(key(p.devis_id, p.metier_id), {
      devis_id: p.devis_id,
      devis_numero: p.devis_numero,
      metier_id: p.metier_id,
      metier: p.metier,
      couleur: p.couleur,
      heures_prevues: p.heures_prevues,
      heures_assignees: 0,
      heures_reelles_validees: 0,
      heures_reelles_soumises: 0,
    });
  }

  const ensure = (devisId: string | null, metierId: number): ConsoLineInput => {
    const k = key(devisId, metierId);
    let line = map.get(k);
    if (!line) {
      line = {
        devis_id: devisId,
        devis_numero: null,
        metier_id: metierId,
        metier: null,
        couleur: null,
        heures_prevues: 0,
        heures_assignees: 0,
        heures_reelles_validees: 0,
        heures_reelles_soumises: 0,
      };
      map.set(k, line);
    }
    return line;
  };

  // Cumule les heures planifiées
  for (const a of fixture.assignations) {
    if (a.affaire_id !== fixture.affaire_id) continue;
    const line = ensure(a.devis_id, a.metier_id);
    line.heures_assignees = (line.heures_assignees ?? 0) + a.heures;
  }

  // Cumule les heures saisies (uniquement non rejetées)
  for (const h of fixture.heures_saisies) {
    if (h.affaire_id !== fixture.affaire_id) continue;
    if (h.statut === "rejete") continue;
    const line = ensure(h.devis_id, h.metier_id);
    if (h.statut === "valide") {
      line.heures_reelles_validees =
        (line.heures_reelles_validees ?? 0) + h.heures_reelles;
    } else {
      // brouillon | soumis
      line.heures_reelles_soumises =
        (line.heures_reelles_soumises ?? 0) + h.heures_reelles;
    }
  }

  // Tri stable (devis, metier_id) pour des tests déterministes
  return [...map.values()].sort((a, b) => {
    const da = a.devis_numero ?? "";
    const db = b.devis_numero ?? "";
    if (da !== db) return da.localeCompare(db);
    return (a.metier_id ?? 0) - (b.metier_id ?? 0);
  });
}

/** Vérifie qu'un objet est bien actif et appartient à l'affaire ciblée. */
export function canStaffObjet(
  fixture: AffaireFixture,
  objetId: string,
): { ok: boolean; reason?: string } {
  const obj = fixture.objets.find((o) => o.id === objetId);
  if (!obj) return { ok: false, reason: "Objet introuvable" };
  if (obj.archive) return { ok: false, reason: "Objet archivé" };
  if (obj.affaire_id !== fixture.affaire_id)
    return { ok: false, reason: "Objet d'une autre affaire" };
  return { ok: true };
}

/** Liste les objets staffés pour une assignation (utilisé par la vue par objet). */
export function objetsForAssignation(
  fixture: AffaireFixture,
  assignationId: string,
): ObjetFixture[] {
  const ids = fixture.assignation_objets
    .filter((l) => l.assignation_id === assignationId)
    .map((l) => l.objet_id);
  return fixture.objets.filter((o) => ids.includes(o.id));
}

/** Total heures planifiées sur un objet (somme des assignations qui le staffent). */
export function heuresStaffeesParObjet(
  fixture: AffaireFixture,
  objetId: string,
): number {
  const assignIds = new Set(
    fixture.assignation_objets
      .filter((l) => l.objet_id === objetId)
      .map((l) => l.assignation_id),
  );
  return fixture.assignations
    .filter((a) => assignIds.has(a.id))
    .reduce((s, a) => s + a.heures, 0);
}

/** Total heures réalisées (validées + soumises) saisies sur un objet précis. */
export function heuresRealiseesParObjet(
  fixture: AffaireFixture,
  objetId: string,
): { validees: number; soumises: number; total: number } {
  let validees = 0;
  let soumises = 0;
  for (const h of fixture.heures_saisies) {
    if (h.fabrication_objet_id !== objetId) continue;
    if (h.statut === "rejete") continue;
    if (h.statut === "valide") validees += h.heures_reelles;
    else soumises += h.heures_reelles;
  }
  return { validees, soumises, total: validees + soumises };
}
