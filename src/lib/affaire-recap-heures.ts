/**
 * Helpers purs pour le récap des heures de l'onglet Affaires.
 *
 * Ces fonctions encapsulent la logique appliquée dans
 * `src/routes/_app.affaires.$affaireId.index.tsx` (bloc `enriched` + `totals`)
 * pour permettre des tests E2E reproductibles.
 *
 * IMPORTANT : si la logique du composant change, mettre à jour ce module.
 *
 * Source : vue Supabase `v_devis_consommation` qui agrège, par
 * (affaire, devis, métier) :
 *   - heures_prevues       : budget devis
 *   - heures_assignees     : heures planifiées (table assignations)
 *   - heures_reelles_validees : heures saisies & validées (heures_saisies)
 *   - heures_reelles_soumises : heures saisies non encore validées
 *
 * Le récap affaire est UNE LIGNE par couple (devis, métier). Un objet de
 * fabrication n'apparaît pas dans ce récap : il est rattaché à des assignations
 * (table assignation_objets) qui elles-mêmes sont comptées dans
 * heures_assignees, et à des saisies d'heures (fabrication_objet_id sur
 * heures_saisies) comptées dans heures_reelles_*.
 */

export interface ConsoLineInput {
  devis_id: string | null;
  devis_numero: string | null;
  metier_id: number | null;
  metier: string | null;
  couleur: string | null;
  heures_prevues: number | null;
  heures_assignees: number | null;
  heures_reelles_validees: number | null;
  heures_reelles_soumises: number | null;
}

export type Tone = "ok" | "warn" | "danger";

export interface EnrichedConsoLine {
  devis_id: string | null;
  devis_numero: string | null;
  metier_id: number | null;
  metier: string | null;
  couleur: string | null;
  prevues: number;
  staffees: number;
  validees: number;
  soumises: number;
  realisees: number;
  pctStaff: number;
  pctReal: number;
  pctValide: number;
  ecart: number;
  tone: Tone;
}

export interface RecapTotals {
  prevues: number;
  staffees: number;
  validees: number;
  soumises: number;
  realisees: number;
  pctStaff: number;
  pctReal: number;
  pctValide: number;
  ecart: number;
}

function num(v: number | null | undefined): number {
  return Number(v ?? 0);
}

/** Reproduit le bloc `enriched` du composant. */
export function enrichLines(lines: ConsoLineInput[]): EnrichedConsoLine[] {
  return lines.map((l) => {
    const prevues = num(l.heures_prevues);
    const staffees = num(l.heures_assignees);
    const validees = num(l.heures_reelles_validees);
    const soumises = num(l.heures_reelles_soumises);
    const realisees = validees + soumises;
    const pctStaff = prevues > 0 ? (staffees / prevues) * 100 : 0;
    const pctReal = prevues > 0 ? (realisees / prevues) * 100 : 0;
    const pctValide = prevues > 0 ? (validees / prevues) * 100 : 0;
    const ecart = prevues - validees;

    const pctMax = Math.max(pctStaff, pctReal);
    let tone: Tone = "ok";
    if (pctMax > 100) tone = "danger";
    else if (pctMax >= 85) tone = "warn";

    return {
      devis_id: l.devis_id,
      devis_numero: l.devis_numero,
      metier_id: l.metier_id,
      metier: l.metier,
      couleur: l.couleur,
      prevues,
      staffees,
      validees,
      soumises,
      realisees,
      pctStaff,
      pctReal,
      pctValide,
      ecart,
      tone,
    };
  });
}

/** Reproduit le bloc `totals` du composant. */
export function computeTotals(lines: EnrichedConsoLine[]): RecapTotals {
  const acc = lines.reduce(
    (a, l) => {
      a.prevues += l.prevues;
      a.staffees += l.staffees;
      a.validees += l.validees;
      a.soumises += l.soumises;
      return a;
    },
    { prevues: 0, staffees: 0, validees: 0, soumises: 0 },
  );
  const realisees = acc.validees + acc.soumises;
  return {
    ...acc,
    realisees,
    pctStaff: acc.prevues > 0 ? (acc.staffees / acc.prevues) * 100 : 0,
    pctReal: acc.prevues > 0 ? (realisees / acc.prevues) * 100 : 0,
    pctValide: acc.prevues > 0 ? (acc.validees / acc.prevues) * 100 : 0,
    ecart: acc.prevues - acc.validees,
  };
}
