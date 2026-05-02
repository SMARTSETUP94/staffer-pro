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
  for (const p of o.postes) {
    if (p.isRegul) {
      if (p.totalHt && p.totalHt > 0) budget += p.totalHt;
      continue;
    }
    if (effectiveIsMatiere(p)) {
      if (p.totalHt && p.totalHt > 0) budget += p.totalHt * o.quantite;
      continue;
    }
    if (p.metier && p.heuresUnitaires > 0) {
      heures[p.metier] += p.heuresUnitaires;
    }
  }
  for (const k of Object.keys(heures) as FabMetier[]) {
    heures[k] = +(heures[k] * o.quantite).toFixed(2);
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
