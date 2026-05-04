/**
 * v0.31.4b — Helpers purs pour DevisImportObjetsHierarchy.
 * Extraits du composant pour permettre des tests Vitest sans rendu DOM.
 */
import type { FabMetier } from "@/hooks/use-fabrication";
import {
  computeFlagsFromMetiers,
  detectTypeFinition,
  emptyHeures,
  type ApplicabilityFlags,
  type HeuresParMetier,
  type TypeFinition,
} from "@/lib/devis-parser/compute-flags";
import type { PosteCandidat } from "@/lib/devis-parser/types";

export interface EditableObjet {
  selected: boolean;
  numero: string;
  sectionNumero: string;
  sectionNom: string;
  /** v0.31.4c — Quantité de la Section parente (multiplicateur final). */
  sectionQuantite: number;
  nom: string;
  description: string | null;
  quantite: number;
  heures: HeuresParMetier;
  budgetMateriaux: number;
  typeFinition: TypeFinition;
  flags: ApplicabilityFlags;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  postes: PosteCandidat[];
  manuel?: boolean;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function effectiveIsMatiere(p: PosteCandidat): boolean {
  return p.isMatiereOverride ?? p.isMatiere;
}

export function isPosteAutoMapped(p: PosteCandidat): boolean {
  if (p.isRegul) return true;
  if (effectiveIsMatiere(p)) return true;
  return p.metier != null && p.heuresUnitaires > 0;
}

export function objetTotalHeures(o: EditableObjet): number {
  return +Object.values(o.heures).reduce((a, b) => a + b, 0).toFixed(2);
}

/**
 * Recalcule les agrégats heures + budget d'un objet à partir de ses postes
 * (avec overrides métier / matière). Heures = heuresUnitaires × quantité objet.
 */
export function recomputeObjet(o: EditableObjet): EditableObjet {
  const heures = emptyHeures();
  let budget = 0;
  const sectionQte = o.sectionQuantite > 0 ? o.sectionQuantite : 1;
  for (const p of o.postes) {
    if (p.isRegul) {
      if (p.totalHt && p.totalHt > 0) budget += p.totalHt * sectionQte;
      continue;
    }
    if (effectiveIsMatiere(p)) {
      if (p.totalHt && p.totalHt > 0) budget += p.totalHt * o.quantite * sectionQte;
      continue;
    }
    if (p.metier && p.heuresUnitaires > 0) {
      heures[p.metier] += p.heuresUnitaires;
    }
  }
  for (const k of Object.keys(heures) as FabMetier[]) {
    heures[k] = +(heures[k] * o.quantite * sectionQte).toFixed(2);
  }
  return {
    ...o,
    heures,
    budgetMateriaux: +budget.toFixed(2),
    flags: computeFlagsFromMetiers(heures),
    typeFinition: detectTypeFinition(heures),
  };
}

export interface CountersGlobal {
  total: number;
  auto: number;
  manuel: number;
  ratio: number;
  totalHeures: number;
  heuresAuto: number;
  heuresManuel: number;
}

export function computeCounters(objets: EditableObjet[]): CountersGlobal {
  let total = 0;
  let auto = 0;
  let manuel = 0;
  let totalHeuresAuto = 0;
  let totalHeuresManuel = 0;
  for (const o of objets) {
    for (const p of o.postes) {
      total++;
      const heuresEff = p.heuresUnitaires * o.quantite;
      if (isPosteAutoMapped(p)) {
        auto++;
        if (!effectiveIsMatiere(p) && !p.isRegul) totalHeuresAuto += heuresEff;
      } else {
        manuel++;
        totalHeuresManuel += heuresEff;
      }
    }
  }
  const ratio = total === 0 ? 100 : Math.round((auto / total) * 100);
  return {
    total,
    auto,
    manuel,
    ratio,
    totalHeures: round2(totalHeuresAuto + totalHeuresManuel),
    heuresAuto: round2(totalHeuresAuto),
    heuresManuel: round2(totalHeuresManuel),
  };
}

/**
 * Déplace un poste d'un objet source vers un objet cible (par index).
 * Renvoie une nouvelle liste avec les agrégats recalculés.
 */
export function movePosteBetweenObjets(
  objets: EditableObjet[],
  fromIdx: number,
  posteId: string,
  toIdx: number,
): EditableObjet[] {
  if (fromIdx === toIdx) return objets;
  const from = objets[fromIdx];
  const to = objets[toIdx];
  if (!from || !to) return objets;
  const poste = from.postes.find((p) => p.id === posteId);
  if (!poste) return objets;
  return objets.map((o, i) => {
    if (i === fromIdx) {
      return recomputeObjet({ ...o, postes: o.postes.filter((p) => p.id !== posteId) });
    }
    if (i === toIdx) {
      return recomputeObjet({ ...o, postes: [...o.postes, poste] });
    }
    return o;
  });
}

/** v0.31.4d — Supprime un poste d'un objet (recompute l'objet). */
export function removePosteFromObjet(
  objets: EditableObjet[],
  objetIdx: number,
  posteId: string,
): EditableObjet[] {
  return objets.map((o, i) =>
    i === objetIdx ? recomputeObjet({ ...o, postes: o.postes.filter((p) => p.id !== posteId) }) : o,
  );
}

/** v0.31.4d — Supprime un objet entier de la liste. */
export function removeObjet(objets: EditableObjet[], objetIdx: number): EditableObjet[] {
  return objets.filter((_, i) => i !== objetIdx);
}

/** v0.31.4d — Renomme la désignation d'un poste (sans recompute heures). */
export function renamePoste(
  objets: EditableObjet[],
  objetIdx: number,
  posteId: string,
  designation: string,
): EditableObjet[] {
  return objets.map((o, i) => {
    if (i !== objetIdx) return o;
    return {
      ...o,
      postes: o.postes.map((p) => (p.id === posteId ? { ...p, designation } : p)),
    };
  });
}

/**
 * v0.39.1 — Fusionne plusieurs objets de niveau 2 en un seul.
 * v0.39.2 — Autorise la fusion cross-section (le merged hérite de la Section
 * du premier objet ; les sources d'autres sections sont tracées dans la description).
 * - Concatène les postes (somme heures via recomputeObjet).
 * - Conserve la quantité du premier objet.
 * - Trace les références sources dans la description (auditabilité).
 * - Supprime les objets sources, insère le merged à la position du premier.
 */
export function mergeObjetsInSection(
  objets: EditableObjet[],
  indexes: number[],
  newNumero: string,
  newNom: string,
): EditableObjet[] {
  if (indexes.length < 2) return objets;
  const sources = indexes
    .map((i) => ({ idx: i, obj: objets[i] }))
    .filter((x) => !!x.obj) as { idx: number; obj: EditableObjet }[];
  if (sources.length < 2) return objets;

  const first = sources[0].obj;
  // v0.39.2 — Avant : on bloquait si sections différentes. Maintenant on autorise
  // la fusion cross-section ; le merged prend la section du premier.
  const allPostes: PosteCandidat[] = sources.flatMap((s) => s.obj.postes);
  const sourceRefs = sources.map((s) => s.obj.numero).join(", ");
  const sourceDescs = sources
    .map((s) => (s.obj.description ? `[${s.obj.numero}] ${s.obj.description}` : null))
    .filter(Boolean)
    .join("\n");
  const mergedDescription = [
    `Fusion de : ${sourceRefs}`,
    sourceDescs || null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const merged: EditableObjet = recomputeObjet({
    ...first,
    numero: newNumero || first.numero,
    nom: newNom || first.nom,
    postes: allPostes,
    description: mergedDescription,
    warnings: [],
    confidence: "medium",
    manuel: false,
  });

  const removeSet = new Set(sources.map((s) => s.idx));
  const firstIdx = sources[0].idx;
  const result: EditableObjet[] = [];
  objets.forEach((o, i) => {
    if (i === firstIdx) result.push(merged);
    else if (!removeSet.has(i)) result.push(o);
  });
  return result;
}

/**
 * v0.39.1 — Décrit l'état du bouton "Fusionner" pour une Section donnée.
 * Le bouton n'est rendu que si `canMerge=true` :
 *  - ≥ 2 objets cochés (`selected=true`) DANS la même Section,
 *  - tous appartiennent au sectionKey demandé (garde-fou cross-section).
 * Retourne aussi les indexes sélectionnés pour pré-remplir la modale.
 */
export interface MergeButtonState {
  canMerge: boolean;
  selectedIdxs: number[];
  count: number;
}

export function getMergeButtonState(
  objets: EditableObjet[],
  sectionObjetIdxs: number[],
): MergeButtonState {
  const selectedIdxs = sectionObjetIdxs.filter((i) => objets[i]?.selected === true);
  return {
    canMerge: selectedIdxs.length >= 2,
    selectedIdxs,
    count: selectedIdxs.length,
  };
}
