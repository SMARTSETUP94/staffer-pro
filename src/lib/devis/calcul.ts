/**
 * Calcul local du devis — miroir exact de la fonction serveur `devis_calculer_interne`.
 * Sert au recalcul immédiat dans l'éditeur ; le chiffre serveur fait foi après enregistrement.
 */
export type LigneType = "zone" | "objet" | "commentaire" | "chapitre_suivi" | "chapitre_pose" | "chapitre_depose" | "option";

export interface CalcLigne { id: string; parent_id: string | null; type: LigneType; quantite: number; ordre?: number }
export interface CalcHeure { ligne_id: string; heures: number; taux_vente: number; cout_revient?: number | null; par_unite: boolean; metier_id?: number | null }
export interface CalcMateriau { ligne_id: string; quantite: number; prix_achat?: number | null; coefficient: number }
export interface CalcLibre { ligne_id: string; quantite: number; prix_achat?: number | null; prix_forfait?: number | null; coefficient: number; par_unite: boolean }

export interface CalcResult {
  total_ht: number; tva: number; ttc: number; options_ht: number;
  lignes: Record<string, number>; racines: Record<string, number>;
  heures_metier: Record<string, number>;
  cout_total: number | null; marge: number | "non_calculable";
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculerDevis(
  lignes: CalcLigne[], heures: CalcHeure[], materiaux: CalcMateriau[], libres: CalcLibre[], tvaPct = 20,
): CalcResult {
  const byParent = new Map<string | null, CalcLigne[]>();
  for (const l of lignes) {
    const k = l.parent_id ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), l]);
  }
  const info = new Map<string, { racine: string; option: boolean; q: number }>();
  const walk = (parent: string | null, racine: string | null, option: boolean) => {
    for (const l of byParent.get(parent) ?? []) {
      const rac = racine ?? l.id;
      const opt = option || l.type === "option";
      info.set(l.id, { racine: rac, option: opt, q: Number(l.quantite) || 0 });
      walk(l.id, rac, opt);
    }
  };
  walk(null, null, false);

  const montants: Record<string, number> = {};
  const racines: Record<string, number> = {};
  const metiers: Record<string, number> = {};
  let ht = 0, opt = 0, cout = 0, manq = false;

  for (const [id, inf] of info) {
    let vu = 0, vl = 0, cu = 0, cl = 0, m = false;
    for (const h of heures) if (h.ligne_id === id) {
      const v = h.heures * h.taux_vente, c = h.heures * (h.cout_revient ?? 0);
      if (h.par_unite) { vu += v; cu += c; } else { vl += v; cl += c; }
      if (h.cout_revient == null && h.heures > 0) m = true;
      if (!inf.option) {
        const k = h.metier_id == null ? "aucun" : String(h.metier_id);
        metiers[k] = r2((metiers[k] ?? 0) + h.heures * (h.par_unite ? inf.q : 1));
      }
    }
    for (const x of materiaux) if (x.ligne_id === id) {
      vu += x.quantite * (x.prix_achat ?? 0) * x.coefficient;
      cu += x.quantite * (x.prix_achat ?? 0);
    }
    for (const f of libres) if (f.ligne_id === id) {
      const v = f.quantite * (f.prix_forfait ?? (f.prix_achat ?? 0) * f.coefficient);
      const c = f.quantite * (f.prix_achat ?? 0);
      if (f.par_unite) { vu += v; cu += c; } else { vl += v; cl += c; }
    }
    const vente = r2(vu * inf.q + vl);
    if (vente !== 0) montants[id] = vente;
    racines[inf.racine] = r2((racines[inf.racine] ?? 0) + vente);
    if (inf.option) opt += vente;
    else { ht += vente; cout += cu * inf.q + cl; if (m) manq = true; }
  }
  const total = r2(ht), tva = r2(total * tvaPct / 100);
  return {
    total_ht: total, tva, ttc: r2(total + tva), options_ht: r2(opt),
    lignes: montants, racines, heures_metier: metiers,
    cout_total: manq ? null : r2(cout), marge: manq ? "non_calculable" : r2(total - cout),
  };
}

/** Aide à la conversion : surface ou pièces → panneaux, ml → barres, perte en %. Arrondi au supérieur. */
export function convertirEnUnitesVente(
  mode: "m2" | "pieces" | "ml",
  saisie: { m2?: number; pieces?: { l: number; w: number; n: number }[]; ml?: number },
  format: { longueur_mm?: number | null; largeur_mm?: number | null },
  pertePct = 0,
): number | null {
  const k = 1 + (pertePct || 0) / 100;
  if (mode === "ml") {
    if (!format.longueur_mm || !saisie.ml) return null;
    return Math.ceil((saisie.ml * k) / (format.longueur_mm / 1000) - 1e-9);
  }
  if (!format.longueur_mm || !format.largeur_mm) return null;
  const surfPanneau = (format.longueur_mm * format.largeur_mm) / 1e6;
  const m2 = mode === "m2"
    ? saisie.m2 ?? 0
    : (saisie.pieces ?? []).reduce((s, p) => s + (p.l * p.w * p.n) / 1e6, 0);
  if (!m2) return null;
  return Math.ceil((m2 * k) / surfPanneau - 1e-9);
}

/** Écart en % entre le taux saisi et le taux de la grille. */
export function ecartTauxPct(taux: number, grille: number | null | undefined): number | null {
  if (grille == null || grille === 0) return null;
  return r2(((taux - grille) / grille) * 100);
}
